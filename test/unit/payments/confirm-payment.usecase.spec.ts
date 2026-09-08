import { BadRequestException } from '@nestjs/common';
import { ConfirmPaymentUseCase } from '../../../src/modules/payments/application/usecases/confirm-payment.usecase.js';

describe('ConfirmPaymentUseCase', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test_secret';
  });

  it('settles via Mercado Pago when payment_id is present', async () => {
    const prisma: any = {};
    const settle: any = {
      execute: async () => ({ ok: true, order_id: 9, status: 'APPROVED' }),
    };
    const uc = new ConfirmPaymentUseCase(prisma, settle);
    const out: any = await uc.execute({ payment_id: 'pay1', status: 'approved', order_id: 9 }, {} as any);
    expect(out.ok).toBe(true);
    expect(out.order_id).toBe(9);
    expect(out.status).toBe('APPROVED');
    expect(out.invoice_url).toContain('order_id=9');
  });

  it('rejects when MP verification fails', async () => {
    const prisma: any = {};
    const settle: any = { execute: async () => ({ ok: false, reason: 'amount_mismatch' }) };
    const uc = new ConfirmPaymentUseCase(prisma, settle);
    await expect(uc.execute({ payment_id: 'pay1' }, {} as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a PENDING order for cash-on-delivery (no payment_id)', async () => {
    const prisma: any = {
      $transaction: async (fn: any) =>
        fn({
          order: { create: async () => ({ orderId: 3 }) },
          orderItem: { createMany: async () => ({}) },
        }),
    };
    const settle: any = { execute: async () => ({ ok: true }) };
    const uc = new ConfirmPaymentUseCase(prisma, settle);
    const out: any = await uc.execute(
      {
        items: [{ product_id: 1, title: 'X', unit_price: 1000, quantity: 1 }],
        shipping: { mode: 'CONTRAENTREGA', nombre: 'Ana', telefono: '300' },
      },
      {} as any,
    );
    expect(out.status).toBe('PENDING');
    expect(out.order_id).toBe(3);
  });
});
