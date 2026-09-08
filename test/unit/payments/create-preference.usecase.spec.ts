import { BadRequestException } from '@nestjs/common';
import { CreatePreferenceUseCase } from '../../../src/modules/payments/application/usecases/create-preference.usecase.js';

describe('CreatePreferenceUseCase', () => {
  it('throws when missing items', async () => {
    const prisma: any = { product: { findUnique: async () => null } };
    const mp: any = { preference: () => ({ create: async () => ({}) }) };
    const uc = new CreatePreferenceUseCase(prisma, mp);

    await expect(uc.execute({ items: [] } as any, {} as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses DB price, creates PENDING order and returns init_point', async () => {
    const prisma: any = {
      product: {
        findUnique: async () => ({
          name: 'Prod',
          price: 10000,
          discountPercent: 0,
          discountStart: null,
          discountEnd: null,
        }),
      },
      $transaction: async (fn: any) =>
        fn({
          order: { create: async () => ({ orderId: 7 }) },
          orderItem: { createMany: async () => ({}) },
        }),
      order: { update: async () => ({}) },
    };

    let savedBody: any = null;
    const mp: any = {
      preference: () => ({
        create: async ({ body }: any) => {
          savedBody = body;
          return {
            id: 'pref_1',
            init_point: 'https://mp/init',
            sandbox_init_point: 'https://mp/sandbox',
          };
        },
      }),
    };

    const uc = new CreatePreferenceUseCase(prisma, mp);

    const out: any = await uc.execute(
      { items: [{ product_id: 1, title: 'Ignorar', unit_price: 1, quantity: 1 }] } as any,
      { headers: {}, protocol: 'http', get: () => 'localhost' } as any,
    );

    expect(out.init_point).toBe('https://mp/init');
    expect(out.id).toBe('pref_1');
    expect(out.order_id).toBe(7);
    expect(out.back_urls).toBeTruthy();
    expect(savedBody.external_reference).toBe('7');
    expect(savedBody.items[0].unit_price).toBe(10000);
    expect(savedBody.notification_url).toContain('/api/payments/webhook');
  });
});
