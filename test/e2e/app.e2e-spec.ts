import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import crypto from 'crypto';
import { AppModule } from '../../src/app.module.js';
import { MpClientService } from '../../src/modules/payments/infrastructure/mp-client.service.js';
import { GetFinanzasReportUseCase } from '../../src/modules/reports/application/usecases/get-finanzas-report.usecase.js';

function has(v: any) {
  return typeof v === 'string' && v.trim().length > 0;
}

function createInvoiceToken(orderId: number, ttlSeconds = 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${orderId}.${exp}`;
  const secret = has(process.env.JWT_SECRET) ? (process.env.JWT_SECRET as string) : 'dev';
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

class MockMpClientService {
  lastExternalRef: string | null = null;
  lastItems: any[] = [];

  preference() {
    return {
      create: async ({ body }: any = {}) => {
        this.lastExternalRef = body?.external_reference ? String(body.external_reference) : null;
        this.lastItems = Array.isArray(body?.items) ? body.items : [];
        return {
          id: 'pref_mock',
          init_point: 'https://mock.mercadopago/init',
          sandbox_init_point: 'https://mock.mercadopago/sandbox',
        };
      },
    };
  }

  payment() {
    const self = this;
    return {
      get: async ({ id }: any) => {
        const amount = self.lastItems.reduce(
          (acc: number, it: any) => acc + Number(it.unit_price || 0) * Number(it.quantity || 1),
          0,
        );
        return {
          id,
          status: 'approved',
          transaction_amount: amount || 5000,
          currency_id: 'COP',
          external_reference: self.lastExternalRef,
        };
      },
    };
  }
}

class MockGetFinanzasReportUseCase {
  async execute(format: 'pdf' | 'xlsx') {
    const contentType = format === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    // Response-like object used by ReportsController
    return {
      ok: true,
      status: 200,
      headers: {
        get: (k: string) => (k.toLowerCase() === 'content-type' ? contentType : null),
      },
      arrayBuffer: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer, // "%PDF"
      text: async () => '',
    } as any;
  }
}

describe('E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';
    process.env.MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || 'MP_TEST_TOKEN';
    process.env.FRONT_URL = process.env.FRONT_URL || 'http://localhost:3000';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MpClientService)
      .useValue(new MockMpClientService())
      .overrideProvider(GetFinanzasReportUseCase)
      .useValue(new MockGetFinanzasReportUseCase())
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('login -> me -> list orders', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/login')
      .send({ email: 'admin@tienda.com', password: 'Admin12345!' })
      .expect(201);

    expect(login.body.token).toBeTruthy();

    const token = login.body.token;

    const me = await request(app.getHttpServer())
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(me.body.email).toBe('admin@tienda.com');

    const orders = await request(app.getHttpServer())
      .get('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(orders.body)).toBe(true);
  });

  it('payments/create returns init_point (MercadoPago mocked)', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/login')
      .send({ email: 'admin@tienda.com', password: 'Admin12345!' })
      .expect(201);

    const product = await request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ name: 'Item preferencia', price: 10000, stock: 5 })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/api/payments/create')
      .send({
        items: [{ product_id: product.body.product_id, title: 'Test item', unit_price: 1, quantity: 1 }],
      })
      .expect(201);

    expect(res.body.init_point).toBe('https://mock.mercadopago/init');
    expect(res.body.id).toBe('pref_mock');
    expect(res.body.order_id).toBeTruthy();
  });

  it('ads + stats + reports + reviews controllers', async () => {
    // Login admin
    const login = await request(app.getHttpServer())
      .post('/api/login')
      .send({ email: 'admin@tienda.com', password: 'Admin12345!' })
      .expect(201);

    const token = login.body.token;
    expect(token).toBeTruthy();

    // Create ad (admin)
    const createdAd = await request(app.getHttpServer())
      .post('/api/ads')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Ad test', image_url: 'https://example.com/a.png', active: true })
      .expect(201);

    expect(createdAd.body.ad_id).toBeTruthy();

    // Public ads
    const ads = await request(app.getHttpServer())
      .get('/api/ads')
      .expect(200);

    expect(Array.isArray(ads.body)).toBe(true);

    // Stats (admin)
    const stats = await request(app.getHttpServer())
      .get('/api/stats/sales?range=day')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(stats.body).toHaveProperty('range');
    expect(stats.body).toHaveProperty('series');

    // Reports (admin) - mocked
    const report = await request(app.getHttpServer())
      .get('/api/reports/finanzas?format=pdf')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(String(report.headers['content-type'] || '')).toContain('application/pdf');

    // Create product to attach reviews
    const product = await request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Producto test', price: 12345, stock: 10 })
      .expect(201);

    const productId = product.body.product_id;
    expect(productId).toBeTruthy();

    // Create review (public)
    const review = await request(app.getHttpServer())
      .post(`/api/products/${productId}/reviews`)
      .send({ name: 'Tester', rating: 5, comment: 'Excelente' })
      .expect(201);

    expect(review.body).toHaveProperty('rating');

    const list = await request(app.getHttpServer())
      .get(`/api/products/${productId}/reviews`)
      .expect(200);

    expect(Array.isArray(list.body)).toBe(true);
  });
  it('full payment flow: create PENDING -> confirm verifies MP API -> webhook idempotent -> invoice', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/login')
      .send({ email: 'admin@tienda.com', password: 'Admin12345!' })
      .expect(201);

    const token = login.body.token;

    const product = await request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Producto Pago', price: 5000, stock: 10 })
      .expect(201);

    const productId = product.body.product_id;

    const pref = await request(app.getHttpServer())
      .post('/api/payments/create')
      .send({
        items: [{ product_id: productId, title: 'Producto Pago', unit_price: 1, quantity: 1 }],
      })
      .expect(201);

    expect(pref.body.init_point).toContain('mock.mercadopago');
    expect(pref.body.order_id).toBeTruthy();
    const orderId = pref.body.order_id;

    const confirm = await request(app.getHttpServer())
      .post('/api/payments/confirm')
      .send({
        status: 'approved',
        payment_id: 'pay_mock_123',
        order_id: orderId,
      })
      .expect(201);

    expect(confirm.body.ok).toBe(true);
    expect(confirm.body.order_id).toBe(orderId);
    expect(String(confirm.body.status).toUpperCase()).toBe('APPROVED');

    await request(app.getHttpServer())
      .post('/api/payments/webhook')
      .query({ topic: 'payment', id: 'pay_mock_123' })
      .expect(200);

    const detail = await request(app.getHttpServer())
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(detail.body.order.order_id).toBe(orderId);
    expect(detail.body.order.payment_status).toBe('APPROVED');
    expect(detail.body.order.status).toBe('APPROVED');

    const invToken = createInvoiceToken(orderId);
    const invoice = await request(app.getHttpServer())
      .get(`/api/invoices/${orderId}`)
      .query({ token: invToken })
      .expect(200);

    expect(invoice.body).toHaveProperty('company');
    expect(invoice.body).toHaveProperty('order');
    expect(invoice.body.order.order_id).toBe(orderId);
    expect(Array.isArray(invoice.body.items)).toBe(true);
    expect(invoice.body.items.length).toBeGreaterThan(0);
  });

});
