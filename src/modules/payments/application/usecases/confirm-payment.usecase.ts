import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../../../common/prisma/prisma.service.js';
import { createInvoiceToken } from '../../../invoices/invoice-token.js';
import { resolveFrontBase } from '../../../auth/application/utils/front-base.js';
import { normalizeItem, roundMoney, safeNumber } from '../utils/payments.utils.js';
import { SettleMercadoPagoPaymentUseCase } from './settle-mercadopago-payment.usecase.js';

function str(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

/**
 * El front llama aquí al volver de Mercado Pago o en contraentrega.
 * El query param status=approved NO se usa para marcar la orden como pagada.
 * Si hay payment_id, se consulta el pago en la API de MP (mismo criterio que el webhook).
 */
@Injectable()
export class ConfirmPaymentUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settle: SettleMercadoPagoPaymentUseCase,
  ) {}

  async execute(body: any, _req: Request) {
    const b = body || {};
    const paymentId = String(b.payment_id || b.paymentId || b.id || '').trim();
    const hintOrderId = Number(b.order_id ?? b.orderId);

    if (paymentId) {
      const settled = await this.settle.execute(
        paymentId,
        Number.isFinite(hintOrderId) && hintOrderId > 0 ? hintOrderId : null,
      );
      if (!settled.ok || !settled.order_id) {
        throw new BadRequestException({ error: settled.reason || 'payment_not_verified' });
      }
      return this.withInvoice(settled.order_id, settled.status || 'PENDING');
    }

    // Contraentrega / pedido sin pasarela: se registra PENDING. Nunca APPROVED desde el cliente.
    const itemsIn = Array.isArray(b.items) ? b.items : Array.isArray(b.cart) ? b.cart : [];
    if (!itemsIn.length) throw new BadRequestException({ error: 'missing_items' });

    const payer_email = String(b.email || b.payer_email || '').trim();
    const buyer = b.buyer || {};
    const factura = b.factura || {};
    const shipping = b.shipping || {};
    const domicilio_costo = safeNumber(shipping?.shipping_cost ?? shipping?.domicilio_costo ?? 0);

    const items = itemsIn.map((it: any) => {
      const n = normalizeItem(it);
      const unit = safeNumber(it.unit_price ?? it.price ?? n.unit_price);
      return { productId: n.productId, quantity: n.quantity, unitPrice: unit, title: n.title };
    });

    const computedTotal = items.reduce((acc, it) => acc + Number(it.unitPrice) * Number(it.quantity), 0) + domicilio_costo;
    const finalTotal = roundMoney(computedTotal);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const o = await tx.order.create({
          data: {
            buyerName: str(b.buyer_name ?? buyer.name ?? shipping?.nombre),
            buyerEmail: str(b.buyer_email ?? buyer.email ?? payer_email),
            buyerPhone: str(b.buyer_phone ?? buyer.phone ?? shipping?.telefono),
            buyerNit: str(b.buyer_nit ?? factura.nit ?? buyer.nit),
            buyerCompany: str(b.buyer_company ?? factura.razon_social ?? buyer.company),
            payerEmail: payer_email || str(b.buyer_email ?? buyer.email) || null,
            totalAmount: String(finalTotal) as any,
            status: 'PENDING',
            paymentStatus: 'PENDING',
            domicilioModo: shipping?.mode ?? null,
            domicilioNombre: shipping?.nombre ?? null,
            domicilioDireccion: shipping?.direccion ?? null,
            domicilioBarrio: shipping?.barrio ?? null,
            domicilioCiudad: shipping?.ciudad ?? null,
            domicilioTelefono: shipping?.telefono ?? null,
            domicilioNota: shipping?.nota ?? null,
            domicilioCosto: String(domicilio_costo) as any,
          },
          select: { orderId: true },
        });

        await tx.orderItem.createMany({
          data: items
            .filter((it) => it.productId && it.productId > 0)
            .map((it) => ({
              orderId: o.orderId,
              productId: it.productId,
              quantity: it.quantity,
              unitPrice: String(it.unitPrice) as any,
              totalPrice: String(Number(it.unitPrice) * Number(it.quantity)) as any,
            })),
        });

        return o;
      });

      return this.withInvoice(created.orderId, 'PENDING');
    } catch (e: any) {
      console.error('Error guardando orden (contraentrega):', e);
      throw new InternalServerErrorException({ error: 'order_save_failed' });
    }
  }

  private withInvoice(orderId: number, status: string) {
    const token = createInvoiceToken(Number(orderId));
    const front = resolveFrontBase().replace(/\/+$/, '');
    const invoice_url = `${front}/factura.html?order_id=${encodeURIComponent(String(orderId))}&token=${encodeURIComponent(token)}`;
    return {
      ok: true,
      order_id: orderId,
      status,
      invoice_url,
    };
  }
}
