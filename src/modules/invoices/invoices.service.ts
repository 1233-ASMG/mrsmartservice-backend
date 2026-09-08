import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { verifyInvoiceToken } from './invoice-token.js';

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Devuelve JSON de factura para admin/contador (sin token).
   * Misma estructura que getInvoiceJson.
   */
  async getInvoiceForAdmin(orderId: number) {
    if (!Number.isFinite(orderId) || orderId <= 0) {
      throw new BadRequestException('bad_order_id');
    }

    const order = await this.prisma.order.findUnique({
      where: { orderId },
      select: {
        orderId: true,
        payerEmail: true,
        domicilioNombre: true,
        domicilioTelefono: true,
        domicilioCiudad: true,
        domicilioDireccion: true,
        domicilioBarrio: true,
        domicilioModo: true,
        domicilioCosto: true,
        totalAmount: true,
        status: true,
        createdAt: true,
        items: {
          orderBy: { orderItemId: 'asc' },
          select: {
            productId: true,
            quantity: true,
            unitPrice: true,
            product: { select: { name: true } },
          },
        },
      },
    });

    if (!order) throw new NotFoundException('not_found');

    const customer_address =
      `${order.domicilioDireccion || ''}` +
      (order.domicilioBarrio ? ` - ${order.domicilioBarrio}` : '');

    const orderLegacy: any = {
      order_id: order.orderId,
      customer_name: order.domicilioNombre || 'Cliente',
      customer_email: order.payerEmail || '',
      customer_phone: order.domicilioTelefono || '',
      customer_city: order.domicilioCiudad || '',
      customer_address,
      domicilio_modo: order.domicilioModo,
      domicilio_costo: Number(order.domicilioCosto),
      total_amount: Number(order.totalAmount),
      status: order.status,
      created_at: order.createdAt,
    };

    const items = order.items.map((it) => ({
      product_id: it.productId,
      name: it.product?.name || `Producto #${it.productId}`,
      quantity: it.quantity,
      unit_price: Number(it.unitPrice),
    }));

    return {
      company: {
        name: 'MR SmartService',
        nit: '1121904526',
        phone: '3014190633',
        email: 'yesfri@hotmail.es',
      },
      order: orderLegacy,
      items,
    };
  }

  /**
   * Devuelve JSON público para renderizar factura imprimible en el frontend.
   * GET /api/invoices/:orderId?token=...
   */
  async getInvoiceJson(orderId: number, token?: string) {
    if (!Number.isFinite(orderId) || orderId <= 0) {
      throw new BadRequestException('bad_order_id');
    }
    if (!token || !verifyInvoiceToken(orderId, token)) {
      throw new UnauthorizedException('unauthorized');
    }

    const order = await this.prisma.order.findUnique({
      where: { orderId },
      select: {
        orderId: true,
        payerEmail: true,
        domicilioNombre: true,
        domicilioTelefono: true,
        domicilioCiudad: true,
        domicilioDireccion: true,
        domicilioBarrio: true,
        domicilioModo: true,
        domicilioCosto: true,
        totalAmount: true,
        status: true,
        createdAt: true,
        items: {
          orderBy: { orderItemId: 'asc' },
          select: {
            productId: true,
            quantity: true,
            unitPrice: true,
            product: { select: { name: true } },
          },
        },
      },
    });

    if (!order) throw new NotFoundException('not_found');

    const customer_address =
      `${order.domicilioDireccion || ''}` +
      (order.domicilioBarrio ? ` - ${order.domicilioBarrio}` : '');

    const orderLegacy: any = {
      order_id: order.orderId,
      customer_name: order.domicilioNombre || 'Cliente',
      customer_email: order.payerEmail || '',
      customer_phone: order.domicilioTelefono || '',
      customer_city: order.domicilioCiudad || '',
      customer_address,
      domicilio_modo: order.domicilioModo,
      domicilio_costo: Number(order.domicilioCosto),
      total_amount: Number(order.totalAmount),
      status: order.status,
      created_at: order.createdAt,
    };

    const items = order.items.map((it) => ({
      product_id: it.productId,
      name: it.product?.name || `Producto #${it.productId}`,
      quantity: it.quantity,
      unit_price: Number(it.unitPrice),
    }));

    return {
      company: {
        name: 'MR SmartService',
        nit: '1121904526',
        phone: '3014190633',
        email: 'yesfri@hotmail.es',
      },
      order: orderLegacy,
      items,
    };
  }
}
