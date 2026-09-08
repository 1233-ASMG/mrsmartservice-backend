import crypto from 'crypto';
import { verifyMercadoPagoWebhookSignature } from '../../../src/modules/payments/application/utils/mp-webhook-signature.js';

describe('verifyMercadoPagoWebhookSignature', () => {
  const prev = process.env.MP_WEBHOOK_SECRET;

  afterEach(() => {
    if (prev === undefined) delete process.env.MP_WEBHOOK_SECRET;
    else process.env.MP_WEBHOOK_SECRET = prev;
  });

  it('allows the request when no secret is configured', () => {
    delete process.env.MP_WEBHOOK_SECRET;
    expect(verifyMercadoPagoWebhookSignature({ headers: {} } as any, '123')).toBe(true);
  });

  it('accepts a valid HMAC signature', () => {
    process.env.MP_WEBHOOK_SECRET = 'whsec';
    const paymentId = '999';
    const requestId = 'req-1';
    const ts = '1700000000';
    const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;
    const v1 = crypto.createHmac('sha256', 'whsec').update(manifest).digest('hex');
    const req = {
      headers: {
        'x-signature': `ts=${ts},v1=${v1}`,
        'x-request-id': requestId,
      },
    };
    expect(verifyMercadoPagoWebhookSignature(req as any, paymentId)).toBe(true);
  });

  it('rejects a tampered signature', () => {
    process.env.MP_WEBHOOK_SECRET = 'whsec';
    const req = {
      headers: {
        'x-signature': 'ts=1,v1=deadbeef',
        'x-request-id': 'req-1',
      },
    };
    expect(verifyMercadoPagoWebhookSignature(req as any, '999')).toBe(false);
  });
});
