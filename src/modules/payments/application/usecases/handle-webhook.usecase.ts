import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { verifyMercadoPagoWebhookSignature } from '../utils/mp-webhook-signature.js';
import { SettleMercadoPagoPaymentUseCase } from './settle-mercadopago-payment.usecase.js';

/**
 * IPN/webhook de Mercado Pago.
 * Siempre consultamos el pago en la API. No confiamos en el body para el estado.
 * Si hay MP_WEBHOOK_SECRET, también validamos x-signature.
 */
@Injectable()
export class HandleWebhookUseCase {
  constructor(private readonly settle: SettleMercadoPagoPaymentUseCase) {}

  async execute(req: Request) {
    const query: any = req.query || {};
    const body: any = (req as any).body || {};
    const topic = String(query.topic || body.topic || '').toLowerCase();
    const type = String(query.type || body.type || '').toLowerCase();

    const paymentId =
      String(query.id || '').trim() ||
      String(body?.data?.id || '').trim() ||
      String(body?.id || '').trim();

    const isPayment = topic === 'payment' || type === 'payment' || Boolean(body?.data?.id);
    if (!paymentId || !isPayment) return { ok: true };

    if (!verifyMercadoPagoWebhookSignature(req, paymentId)) {
      throw new UnauthorizedException({ error: 'invalid_mp_signature' });
    }

    if (!process.env.MP_ACCESS_TOKEN) return { ok: true };

    await this.settle.execute(paymentId);
    return { ok: true };
  }
}
