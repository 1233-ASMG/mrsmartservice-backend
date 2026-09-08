import { MpClientService } from '../../../src/modules/payments/infrastructure/mp-client.service.js';

describe('MpClientService', () => {
  const prevToken = process.env.MP_ACCESS_TOKEN;
  const prevMock = process.env.MP_MOCK;

  afterEach(() => {
    if (prevToken === undefined) delete process.env.MP_ACCESS_TOKEN;
    else process.env.MP_ACCESS_TOKEN = prevToken;
    if (prevMock === undefined) delete process.env.MP_MOCK;
    else process.env.MP_MOCK = prevMock;
  });

  it('returns a fake preference in mock mode', async () => {
    delete process.env.MP_ACCESS_TOKEN;
    process.env.MP_MOCK = '1';
    const client = new MpClientService();
    const pref = client.preference();
    const out: any = await pref.create({ body: {} } as any);
    expect(out.init_point).toContain('mock.mercadopago');
  });

  it('throws when payment() is used without token and without mock', () => {
    delete process.env.MP_ACCESS_TOKEN;
    delete process.env.MP_MOCK;
    const client = new MpClientService();
    expect(() => client.payment()).toThrow();
  });
});
