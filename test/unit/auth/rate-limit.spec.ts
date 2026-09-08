import { allowAttempt } from '../../../src/common/rate-limit.js';
import { createInvoiceToken, verifyInvoiceToken } from '../../../src/modules/invoices/invoice-token.js';

describe('allowAttempt', () => {
  it('blocks after max hits in the window', () => {
    const key = `test-${Date.now()}`;
    expect(allowAttempt(key, 2, 60_000)).toBe(true);
    expect(allowAttempt(key, 2, 60_000)).toBe(true);
    expect(allowAttempt(key, 2, 60_000)).toBe(false);
  });
});

describe('invoice-token', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test_secret';
  });

  it('roundtrips a valid token', () => {
    const token = createInvoiceToken(42, 3600);
    expect(verifyInvoiceToken(42, token)).toBe(true);
    expect(verifyInvoiceToken(41, token)).toBe(false);
  });
});
