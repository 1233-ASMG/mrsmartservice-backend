import crypto from 'crypto';

function has(v: any) {
  return typeof v === 'string' && v.trim().length > 0;
}

function signingSecret() {
  if (!has(process.env.JWT_SECRET)) {
    throw new Error('JWT_SECRET no está definido');
  }
  return process.env.JWT_SECRET!;
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function createInvoiceToken(orderId: number, ttlSeconds = 7 * 24 * 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${orderId}.${exp}`;
  const sig = crypto.createHmac('sha256', signingSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyInvoiceToken(orderId: number, token: string) {
  try {
    const [oid, exp, sig] = String(token || '').split('.');
    if (Number(oid) !== Number(orderId)) return false;
    if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
    const payload = `${oid}.${exp}`;
    const expected = crypto.createHmac('sha256', signingSecret()).update(payload).digest('base64url');
    return safeEqual(expected, sig);
  } catch {
    return false;
  }
}
