import { Injectable } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { PrismaService } from '../../../../common/prisma/prisma.service.js';
import { MpClientService } from '../../infrastructure/mp-client.service.js';
import { amountsMatch, MP_CURRENCY } from '../utils/payments.utils.js';

function has(v: any) {
  return typeof v === 'string' && v.trim().length > 0;
}

export type SettleResult = {
  ok: boolean;
  order_id?: number;
  status?: string;
  reason?: string;
};

/**
 * Fuente de verdad del cobro: consulta el pago en la API de Mercado Pago.
 * Ni el back_url ni el body del front pueden marcar una orden como pagada.
 */
@Injectable()
export class SettleMercadoPagoPaymentUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mp: MpClientService,
  ) {}

  async execute(paymentId: string, hintOrderId?: number | null): Promise<SettleResult> {
    const id = String(paymentId || '').trim();
    if (!id) return { ok: false, reason: 'missing_payment_id' };

    const pay = this.mp.payment();
    const out = await pay.get({ id });
    const data: any = (out as any)?.response ?? out;

    const mpStatus = String(data?.status || '').toLowerCase();
    const paidAmount = Number(data?.transaction_amount);
    const currency = String(data?.currency_id || '').toUpperCase();
    const externalRef = String(data?.external_reference || '').trim();

    const order = await this.findOrder({
      paymentId: id,
      externalRef,
      hintOrderId,
    });
    if (!order) return { ok: false, reason: 'order_not_found' };

    const expected = Number(order.totalAmount);
    if (!Number.isFinite(paidAmount) || !amountsMatch(expected, paidAmount)) {
      return { ok: false, order_id: order.orderId, status: order.status, reason: 'amount_mismatch' };
    }
    if (currency && currency !== String(MP_CURRENCY).toUpperCase()) {
      return { ok: false, order_id: order.orderId, status: order.status, reason: 'currency_mismatch' };
    }

    const alreadyApproved = String(order.status || '').toUpperCase() === 'APPROVED';
    if (mpStatus !== 'approved') {
      const mapped = mpStatus.toUpperCase() || 'PENDING';
      if (!alreadyApproved) {
        await this.prisma.order.update({
          where: { orderId: order.orderId },
          data: { paymentId: id, paymentStatus: mapped, status: mapped },
        });
      }
      return { ok: true, order_id: order.orderId, status: alreadyApproved ? 'APPROVED' : mapped };
    }

    if (!alreadyApproved) {
      await this.prisma.order.update({
        where: { orderId: order.orderId },
        data: {
          paymentId: id,
          paymentStatus: 'APPROVED',
          status: 'APPROVED',
          approved_at: new Date(),
        },
      });
      this.notifyAdmin(order.orderId).catch((err) => {
        console.error('Error enviando notificación de venta:', err);
      });
    }

    return { ok: true, order_id: order.orderId, status: 'APPROVED' };
  }

  private async findOrder(opts: { paymentId: string; externalRef: string; hintOrderId?: number | null }) {
    if (opts.hintOrderId && Number.isFinite(opts.hintOrderId) && opts.hintOrderId! > 0) {
      const byHint = await this.prisma.order.findUnique({ where: { orderId: opts.hintOrderId } });
      if (byHint) return byHint;
    }

    if (opts.paymentId) {
      const byPay = await this.prisma.order.findFirst({ where: { paymentId: opts.paymentId } });
      if (byPay) return byPay;
    }

    const refNum = Number(opts.externalRef);
    if (Number.isFinite(refNum) && refNum > 0) {
      return this.prisma.order.findUnique({ where: { orderId: refNum } });
    }
    return null;
  }

  private getAdminEmails(): string[] {
    const list: string[] = [];
    const envList = process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '';
    for (const e of envList.split(/[,;\s]+/)) {
      const t = e.trim();
      if (t && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) list.push(t);
    }
    return [...new Set(list)];
  }

  private async notifyAdmin(orderId: number) {
    const toEmails = this.getAdminEmails();
    if (!toEmails.length || !has(process.env.SMTP_HOST) || !has(process.env.SMTP_USER) || !has(process.env.SMTP_PASS)) {
      return;
    }

    const order = await this.prisma.order.findUnique({
      where: { orderId },
      include: { items: { include: { product: { select: { name: true } } } } },
    });
    if (!order) return;

    const isDomicilio = String(order.domicilioModo || '').toLowerCase() === 'domicilio';
    const entrega = isDomicilio ? 'Envío a domicilio' : 'Recoge en local';
    const rows = (order.items || [])
      .map((it) => {
        const name = it.product?.name || `Producto #${it.productId}`;
        return `<tr><td>${escapeHtml(name)}</td><td>${Number(it.unitPrice).toLocaleString('es-CO')}</td><td>${it.quantity}</td><td>${Number(it.totalPrice).toLocaleString('es-CO')}</td></tr>`;
      })
      .join('');

    const html = `
      <p>Nueva venta aprobada (verificada con Mercado Pago).</p>
      <p><strong>Pedido #${orderId}</strong> | ${entrega}</p>
      <p><strong>Comprador:</strong> ${escapeHtml(order.buyerName || 'N/A')} | ${escapeHtml(order.buyerEmail || order.payerEmail || '')}</p>
      <table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>Producto</th><th>Valor</th><th>Cant.</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
      <p><strong>Total: ${Number(order.totalAmount).toLocaleString('es-CO')}</strong></p>
    `;

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    await transporter.sendMail({
      from: `"MR SmartService" <${process.env.SMTP_USER}>`,
      to: toEmails.join(','),
      replyTo: order.buyerEmail || order.payerEmail || undefined,
      subject: `Nueva venta aprobada #${orderId} - MR SmartService`,
      html,
    });
  }
}

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
