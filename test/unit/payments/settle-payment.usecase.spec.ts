import { HandleWebhookUseCase } from '../../../src/modules/payments/application/usecases/handle-webhook.usecase.js';
import { SettleMercadoPagoPaymentUseCase } from '../../../src/modules/payments/application/usecases/settle-mercadopago-payment.usecase.js';

describe('SettleMercadoPagoPaymentUseCase', () => {
  it('does not mark APPROVED when MP status is not approved', async () => {
    const prisma: any = {
      order: {
        findUnique: async () => ({ orderId: 1, totalAmount: 5000, status: 'PENDING', paymentId: null }),
        findFirst: async () => null,
        update: async () => ({}),
      },
    };
    const mp: any = {
      payment: () => ({
        get: async () => ({ status: 'pending', transaction_amount: 5000, currency_id: 'COP', external_reference: '1' }),
      }),
    };
    const uc = new SettleMercadoPagoPaymentUseCase(prisma, mp);
    const out = await uc.execute('pay1', 1);
    expect(out.ok).toBe(true);
    expect(out.status).toBe('PENDING');
  });

  it('marks APPROVED when amount, currency and status match', async () => {
    const prisma: any = {
      order: {
        findUnique: async () => ({ orderId: 1, totalAmount: 5000, status: 'PENDING', paymentId: null }),
        findFirst: async () => null,
        update: async () => ({}),
      },
    };
    const mp: any = {
      payment: () => ({
        get: async () => ({
          status: 'approved',
          transaction_amount: 5000,
          currency_id: 'COP',
          external_reference: '1',
        }),
      }),
    };
    const uc = new SettleMercadoPagoPaymentUseCase(prisma, mp);
    const out = await uc.execute('pay1', 1);
    expect(out.ok).toBe(true);
    expect(out.status).toBe('APPROVED');
  });

  it('rejects amount mismatch', async () => {
    const prisma: any = {
      order: {
        findUnique: async () => ({ orderId: 1, totalAmount: 5000, status: 'PENDING', paymentId: null }),
        findFirst: async () => null,
      },
    };
    const mp: any = {
      payment: () => ({
        get: async () => ({ status: 'approved', transaction_amount: 1, currency_id: 'COP', external_reference: '1' }),
      }),
    };
    const uc = new SettleMercadoPagoPaymentUseCase(prisma, mp);
    const out = await uc.execute('pay1', 1);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('amount_mismatch');
  });

  it('rejects currency mismatch and missing payment id', async () => {
    const prisma: any = {
      order: {
        findUnique: async () => ({ orderId: 1, totalAmount: 5000, status: 'PENDING', paymentId: null }),
        findFirst: async () => null,
      },
    };
    const mp: any = {
      payment: () => ({
        get: async () => ({ status: 'approved', transaction_amount: 5000, currency_id: 'USD', external_reference: '1' }),
      }),
    };
    const uc = new SettleMercadoPagoPaymentUseCase(prisma, mp);
    expect(await uc.execute('')).toEqual({ ok: false, reason: 'missing_payment_id' });
    const out = await uc.execute('pay1', 1);
    expect(out.reason).toBe('currency_mismatch');
  });

  it('finds the order by paymentId when no hint is given', async () => {
    const prisma: any = {
      order: {
        findUnique: async () => null,
        findFirst: async () => ({ orderId: 4, totalAmount: 5000, status: 'APPROVED', paymentId: 'pay1' }),
        update: async () => ({}),
      },
    };
    const mp: any = {
      payment: () => ({
        get: async () => ({ status: 'approved', transaction_amount: 5000, currency_id: 'COP', external_reference: '' }),
      }),
    };
    const uc = new SettleMercadoPagoPaymentUseCase(prisma, mp);
    const out = await uc.execute('pay1');
    expect(out.ok).toBe(true);
    expect(out.status).toBe('APPROVED');
  });

  it('resolves order by external_reference and skips email without SMTP', async () => {
    process.env.ADMIN_EMAIL = 'owner@example.com';
    const prisma: any = {
      order: {
        findUnique: async ({ where }: any) =>
          where?.orderId === 8 ? { orderId: 8, totalAmount: 2000, status: 'PENDING', paymentId: null } : null,
        findFirst: async () => null,
        update: async () => ({}),
      },
    };
    const mp: any = {
      payment: () => ({
        get: async () => ({
          status: 'approved',
          transaction_amount: 2000,
          currency_id: 'COP',
          external_reference: '8',
        }),
      }),
    };
    const uc = new SettleMercadoPagoPaymentUseCase(prisma, mp);
    const out = await uc.execute('pay8');
    expect(out.ok).toBe(true);
    expect(out.order_id).toBe(8);
    await new Promise((r) => setTimeout(r, 20));
    delete process.env.ADMIN_EMAIL;
  });
});

describe('HandleWebhookUseCase', () => {
  const prevToken = process.env.MP_ACCESS_TOKEN;
  const prevSecret = process.env.MP_WEBHOOK_SECRET;

  afterEach(() => {
    if (prevToken === undefined) delete process.env.MP_ACCESS_TOKEN;
    else process.env.MP_ACCESS_TOKEN = prevToken;
    if (prevSecret === undefined) delete process.env.MP_WEBHOOK_SECRET;
    else process.env.MP_WEBHOOK_SECRET = prevSecret;
  });

  it('returns ok for non-payment notifications', async () => {
    const settle: any = { execute: async () => ({ ok: true }) };
    const uc = new HandleWebhookUseCase(settle);
    const out = await uc.execute({ query: {}, body: {} } as any);
    expect(out).toEqual({ ok: true });
  });

  it('settles a payment notification', async () => {
    process.env.MP_ACCESS_TOKEN = 'tok';
    delete process.env.MP_WEBHOOK_SECRET;
    let calledWith: string | null = null;
    const settle: any = {
      execute: async (id: string) => {
        calledWith = id;
        return { ok: true, order_id: 1 };
      },
    };
    const uc = new HandleWebhookUseCase(settle);
    const out = await uc.execute({ query: { topic: 'payment', id: '55' }, body: {}, headers: {} } as any);
    expect(out).toEqual({ ok: true });
    expect(calledWith).toBe('55');
  });
});
