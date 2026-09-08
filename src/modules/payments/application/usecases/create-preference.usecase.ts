import { BadRequestException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../../../common/prisma/prisma.service.js';
import { MpClientService } from '../../infrastructure/mp-client.service.js';
import { CreatePaymentDto } from '../../dto/create-payment.dto.js';
import {
  buildBackUrls,
  envBool,
  MP_CURRENCY,
  normalizeItem,
  notificationUrl,
  roundMoney,
  villavicencioShippingPrice,
} from '../utils/payments.utils.js';

/**
 * Crea la preferencia de Mercado Pago y deja la orden en PENDING.
 * Los precios salen de la base de datos, no del carrito.
 * El cobro se confirma después con webhook + Payment.get, no con back_url.
 */
@Injectable()
export class CreatePreferenceUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mp: MpClientService,
  ) {}

  async execute(dto: CreatePaymentDto, req: Request) {
    const itemsIn = Array.isArray(dto?.items) ? dto.items : [];
    if (!itemsIn.length) throw new BadRequestException({ error: 'missing_items' });

    const mpItems: any[] = [];
    const dbItems: { productId: number | null; quantity: number; unitPrice: number; title: string }[] = [];

    for (const raw of itemsIn) {
      const n = normalizeItem(raw);

      if (n.isShipping) {
        const shipPrice = villavicencioShippingPrice();
        mpItems.push({
          id: 'SHIP',
          title: n.title || 'Envío',
          unit_price: shipPrice,
          quantity: n.quantity,
          currency_id: MP_CURRENCY,
        });
        dbItems.push({ productId: null, quantity: n.quantity, unitPrice: shipPrice, title: n.title || 'Envío' });
        continue;
      }

      if (!Number.isFinite(n.productId) || (n.productId as number) <= 0) {
        throw new BadRequestException({ error: 'bad_item' });
      }

      const productId = n.productId as number;
      const p = await this.prisma.product.findUnique({
        where: { productId },
        select: { name: true, price: true, discountPercent: true, discountStart: true, discountEnd: true },
      });
      if (!p) throw new BadRequestException({ error: 'product_not_found', productId });

      let price = Number(p.price);
      const discount = Number(p.discountPercent || 0);
      if (discount > 0) {
        let active = true;
        if (p.discountStart && p.discountEnd) {
          const now = new Date();
          active = now >= new Date(p.discountStart) && now <= new Date(p.discountEnd);
        }
        if (active) price = Math.round(price * (1 - discount / 100));
      }
      price = roundMoney(price);
      if (!Number.isFinite(price) || price <= 0) throw new BadRequestException({ error: 'bad_item' });

      const title = p.name || n.title || 'Producto';
      mpItems.push({
        id: String(productId),
        title,
        unit_price: price,
        quantity: n.quantity,
        currency_id: MP_CURRENCY,
      });
      dbItems.push({ productId, quantity: n.quantity, unitPrice: price, title });
    }

    const shipping = dto.shipping || {};
    const domicilioCosto = dbItems
      .filter((it) => it.productId == null)
      .reduce((acc, it) => acc + it.unitPrice * it.quantity, 0);
    const productsTotal = dbItems
      .filter((it) => it.productId != null)
      .reduce((acc, it) => acc + it.unitPrice * it.quantity, 0);
    const finalTotal = roundMoney(productsTotal + domicilioCosto);

    const created = await this.prisma.$transaction(async (tx) => {
      const o = await tx.order.create({
        data: {
          buyerName: shipping.nombre ?? null,
          buyerPhone: shipping.telefono ?? null,
          totalAmount: String(finalTotal) as any,
          status: 'PENDING',
          paymentStatus: 'PENDING',
          domicilioModo: shipping.mode ?? null,
          domicilioNombre: shipping.nombre ?? null,
          domicilioDireccion: shipping.direccion ?? null,
          domicilioBarrio: shipping.barrio ?? null,
          domicilioCiudad: shipping.ciudad ?? null,
          domicilioTelefono: shipping.telefono ?? null,
          domicilioNota: shipping.nota ?? null,
          domicilioCosto: String(domicilioCosto) as any,
        },
        select: { orderId: true },
      });

      await tx.orderItem.createMany({
        data: dbItems
          .filter((it) => it.productId != null)
          .map((it) => ({
            orderId: o.orderId,
            productId: it.productId,
            quantity: it.quantity,
            unitPrice: String(it.unitPrice) as any,
            totalPrice: String(it.unitPrice * it.quantity) as any,
          })),
      });

      return o;
    });

    const back_urls = buildBackUrls('/postpago');
    const pref = this.mp.preference();
    const body: any = {
      items: mpItems,
      external_reference: String(created.orderId),
      notification_url: notificationUrl(req),
      back_urls: {
        success: back_urls.success,
        failure: back_urls.failure,
        pending: back_urls.pending,
      },
      binary_mode: envBool(process.env.MP_BINARY_MODE, true),
      auto_return: 'approved',
    };

    const out = await pref.create({ body });
    const data: any = (out as any) ?? {};
    const response = data.response ?? data;

    await this.prisma.order.update({
      where: { orderId: created.orderId },
      data: {
        mpPreferenceId: response.id ? String(response.id) : null,
        mpInitPoint: response.init_point ? String(response.init_point) : null,
      },
    });

    return {
      init_point: response.init_point,
      sandbox_init_point: response.sandbox_init_point,
      id: response.id,
      order_id: created.orderId,
      back_urls,
    };
  }
}
