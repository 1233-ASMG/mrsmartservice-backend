import { OrdersRepository } from '../../../src/modules/orders/orders.repository.js';

function sampleOrder(over: any = {}) {
  return {
    orderId: 1,
    status: 'APPROVED',
    totalAmount: 5000,
    paymentMethod: 'mp',
    paymentId: 'pay1',
    paymentStatus: 'APPROVED',
    mpPreferenceId: 'pref',
    mpInitPoint: 'https://mp',
    payerEmail: 'a@b.com',
    createdAt: new Date('2026-01-01T12:00:00Z'),
    updatedAt: new Date('2026-01-01T12:00:00Z'),
    buyerName: 'Ana',
    buyerEmail: 'ana@b.com',
    domicilioModo: 'RECOGER',
    domicilioNombre: 'Ana',
    domicilioDireccion: 'C 1',
    domicilioBarrio: 'Centro',
    domicilioCiudad: 'Villavicencio',
    domicilioTelefono: '300',
    domicilioNota: 'n',
    domicilioCosto: 0,
    fechaDomicilio: null,
    estadoDomicilio: null,
    items: [
      {
        orderItemId: 10,
        orderId: 1,
        productId: 2,
        quantity: 1,
        unitPrice: 5000,
        totalPrice: 5000,
        product: { name: 'Prod', imageUrl: '/x.png' },
      },
    ],
    ...over,
  };
}

describe('OrdersRepository', () => {
  it('lists orders with filters and maps snake_case', async () => {
    const prisma: any = {
      order: {
        findMany: async () => [sampleOrder()],
      },
    };
    const repo = new OrdersRepository(prisma);
    const rows = await repo.list({
      status: 'approved',
      q: '1',
      from: '2026-01-01',
      to: '2026-01-31',
    });
    expect(rows[0].order_id).toBe(1);
    expect(rows[0].buyer_email).toBe('ana@b.com');
  });

  it('returns null when getOrder misses', async () => {
    const prisma: any = { order: { findUnique: async () => null } };
    const repo = new OrdersRepository(prisma);
    expect(await repo.getOrder(99)).toBeNull();
  });

  it('returns order detail with items', async () => {
    const prisma: any = { order: { findUnique: async () => sampleOrder() } };
    const repo = new OrdersRepository(prisma);
    const out = await repo.getOrder(1);
    expect(out.order.order_id).toBe(1);
    expect(out.items[0].product_name).toBe('Prod');
  });

  it('lists approved orders for export', async () => {
    const prisma: any = { order: { findMany: async () => [sampleOrder()] } };
    const repo = new OrdersRepository(prisma);
    const rows = await repo.listForExport('2026-01-01', '2026-01-31');
    expect(rows[0].items[0].quantity).toBe(1);
  });
});
