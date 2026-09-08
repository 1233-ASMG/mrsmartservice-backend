import crypto from 'crypto';
import type { Request } from 'express';

function parseSignatureHeader(raw: string) {
  const out: Record<string, string> = {};
  for (const part of String(raw || '').split(',')) {
    const [k, ...rest] = part.trim().split('=');
    if (!k || !rest.length) continue;
    out[k.trim()] = rest.join('=').trim();
  }
  return out;
}

/**
 * Valida x-signature de Mercado Pago (webhooks).
 * Documentación: id:{data.id};request-id:{x-request-id};ts:{ts};
 * Si no hay MP_WEBHOOK_SECRET, no podemos firmar: se sigue consultando el pago en la API.
 */
export function verifyMercadoPagoWebhookSignature(req: Request, paymentId: string): boolean {
  const secret = String(process.env.MP_WEBHOOK_SECRET || '').trim();
  if (!secret) return true;

  const xSignature = String(req.headers['x-signature'] || '');
  const xRequestId = String(req.headers['x-request-id'] || '');
  const parsed = parseSignatureHeader(xSignature);
  const ts = parsed.ts;
  const hash = parsed.v1;
  if (!ts || !hash || !xRequestId || !paymentId) return false;

  const manifest = `id:${paymentId};request-id:${xRequestId};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  if (expected.length !== hash.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(hash, 'utf8'));
  } catch {
    return false;
  }
}
