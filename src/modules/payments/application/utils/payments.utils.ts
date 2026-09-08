import type { Request } from 'express';

export const MP_CURRENCY = process.env.MP_CURRENCY_ID || 'COP';

export function safeNumber(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function envBool(v: any, fallback: boolean) {
  if (v === undefined || v === null || v === '') return fallback;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'y';
}

export function baseUrlFromReq(req: Request) {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || `localhost:${process.env.PORT || 8080}`;
  return `${proto}://${host}`;
}

const FALLBACK_FRONT_HTTPS = 'https://mrsmartservice-front-next-1avp.vercel.app';

/** Base URL del front (sin barra final). */
export function frontBase() {
  const s = String(process.env.FRONT_URL || '').trim().replace(/\/+$/, '');
  if (s) return s;
  return FALLBACK_FRONT_HTTPS;
}

/**
 * Base URL solo para Mercado Pago. MP rechaza back_urls con HTTP cuando se usa auto_return
 * (error "auto_return invalid. back_url.success must be defined"). En local con FRONT_URL
 * tipo http://127.0.0.1:5500/... hay que usar una URL HTTPS; por defecto el front en Vercel.
 * Opcional: MP_FRONT_URL=https://tu-dominio.com para producción.
 */
export function frontBaseForMercadoPago(): string {
  const env = process.env.MP_FRONT_URL || process.env.FRONT_URL || '';
  const s = String(env).trim().replace(/\/+$/, '');
  if (s && s.startsWith('https://')) return s;
  return FALLBACK_FRONT_HTTPS;
}

/** URLs de retorno para preferencia MP: siempre HTTPS y absolutas para que MP acepte auto_return. */
export function buildBackUrls(path = '/postpago') {
  const base = frontBaseForMercadoPago();
  const p = path.startsWith('/') ? path : `/${path}`;
  const url = `${base.replace(/\/+$/, '')}${p}`;
  return {
    success: url,
    failure: url,
    pending: url,
  };
}

export function roundMoney(v: number) {
  if (MP_CURRENCY === 'COP') return Math.round(v);
  return Math.round(v * 100) / 100;
}

/** Precio de envío a Villavicencio: lo define el servidor, no el carrito. */
export function villavicencioShippingPrice() {
  const n = Number(process.env.SHIPPING_VILLAVICENCIO_COP || 7000);
  return roundMoney(Number.isFinite(n) && n > 0 ? n : 7000);
}

export function amountsMatch(expected: number, paid: number) {
  if (MP_CURRENCY === 'COP') return Math.round(expected) === Math.round(paid);
  return Math.abs(Number(expected) - Number(paid)) < 0.01;
}

export function notificationUrl(req: Request) {
  const env = String(process.env.PUBLIC_API_URL || '').trim().replace(/\/+$/, '');
  const base = env || baseUrlFromReq(req).replace(/\/+$/, '');
  return `${base}/api/payments/webhook`;
}

export function normalizeItem(i: any) {
  const rawId = i?.product_id ?? i?.productId ?? i?.id;
  const rawIdStr = rawId === undefined || rawId === null ? '' : String(rawId).trim();
  const isShipping = rawIdStr.toUpperCase() === 'SHIP' || String(i?.type || '').toLowerCase() === 'shipping';

  const parsedId = Number(rawIdStr);
  const productId = isShipping ? 0 : (Number.isFinite(parsedId) ? parsedId : null);
  const quantity = Math.max(1, Number(i?.quantity ?? 1));
  const title = String(i?.title ?? i?.name ?? (isShipping ? 'Envío' : `Producto #${productId}`)).trim();
  const unit_price = safeNumber(i?.unit_price ?? i?.price);
  return { productId, quantity, title, unit_price, isShipping };
}