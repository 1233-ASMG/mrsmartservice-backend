/**
 * Límite simple en memoria (un proceso). Sirve para el panel y credenciales
 * públicas; no sustituye un WAF en un producto con mucho tráfico.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function allowAttempt(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const cur = buckets.get(key);
  if (!cur || now >= cur.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (cur.count >= max) return false;
  cur.count += 1;
  return true;
}

export function clientKey(req: { ip?: string; headers?: any; socket?: { remoteAddress?: string } }): string {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || 'unknown';
}
