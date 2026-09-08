# mrsmartservice API (NestJS)

Backend del ecommerce de portafolio: catálogo, panel admin, órdenes y cobro con Mercado Pago.

Front: [mrsmartservice-front-next](https://github.com/1233-ASMG/mrsmartservice-front-next).

## Mapa rápido

| Área | Dónde |
| --- | --- |
| Login panel | `src/modules/auth/application/usecases/login.usecase.ts` |
| Cobro MP | `src/modules/payments/application/usecases/` |
| Webhook | `POST /api/payments/webhook` |
| Órdenes admin | `src/modules/orders/` (JWT + roles) |
| Diagnóstico | `GET /api/health` (sin debug de tokens) |

`src/modules/auth/auth.service.ts` es legado: no está en el módulo. El login que corre es el use case.

## Cómo se cobra (para explicar en entrevista)

1. `POST /api/payments/create` — precios de la **base de datos**, orden `PENDING`, `notification_url`.
2. Webhook `POST /api/payments/webhook` — firma si hay `MP_WEBHOOK_SECRET` + `Payment.get` (`approved`, monto, moneda).
3. Al volver al sitio, `POST /api/payments/confirm` consulta **la misma API**. No cobra por `back_url`.

## Arranque local

```bash
cp .env.example .env
# DATABASE_URL, JWT_SECRET; MP_ACCESS_TOKEN si vas a cobrar de verdad
npm install
npm run db:init
npm run dev
```

`GET /api/health` en `http://localhost:8080`. Sin MP: `MP_MOCK=1`.

## Auth

- CORS en producción: `FRONT_URL`, Vercel del front, Firebase viejo y localhost. Sin Origin (webhooks) sí pasa.
- Login, credenciales de cliente y software-auth tienen rate limit por IP.
- Credenciales de software del comprador: solo si la orden está `APPROVED` y el email coincide.

## Variables

Nombres en `.env.example`, **sin valores reales**. Access token de MP y JWT no van al front ni a git.

## Panel (solo desarrollo)

Con `NODE_ENV !== production` y `SEED_DEFAULT_USERS=1` se pueden crear usuarios locales. Pon las claves en `.env` (`SEED_ADMIN_PASSWORD`, etc.), no en el README.

## Stack

NestJS, Prisma, Postgres, Mercado Pago SDK v2.
