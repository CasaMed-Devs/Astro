jest.mock('../config/firebase-admin', () => ({ adminFirestore: jest.fn() }));

import {
  computeBillingPeriodEnd,
  computeGstBreakdown,
  formatInvoiceNumber,
  invoiceMonthKey,
} from './invoice.service';

describe('computeGstBreakdown', () => {
  it('matches the reference Rs 49 invoice', () => {
    expect(computeGstBreakdown(49)).toEqual({ taxableValue: 41.52, cgst: 3.74, sgst: 3.74 });
  });

  it.each([1, 49, 99, 299, 499.5])('adds back up to exactly Rs %p', (amount) => {
    const { taxableValue, cgst, sgst } = computeGstBreakdown(amount);
    expect(Math.round((taxableValue + cgst + sgst) * 100)).toBe(Math.round(amount * 100));
    expect(cgst).toBe(sgst);
  });
});

describe('invoice numbering', () => {
  it('formats a zero-padded per-month number', () => {
    expect(formatInvoiceNumber('202610', 1)).toBe('INV-202610-000001');
  });

  it('buckets a late-evening UTC payment into the next Indian month', () => {
    expect(invoiceMonthKey(new Date('2026-09-30T20:00:00Z'))).toBe('202610');
    expect(invoiceMonthKey(new Date('2026-09-30T10:00:00Z'))).toBe('202609');
  });
});

describe('computeBillingPeriodEnd', () => {
  it('ends a trial one day after it starts', () => {
    const end = computeBillingPeriodEnd('trial', new Date('2026-10-01T06:00:00Z'));
    expect(end.toISOString()).toBe('2026-10-02T06:00:00.000Z');
  });

  it('ends a monthly period on the same day next month', () => {
    const end = computeBillingPeriodEnd('monthly', new Date('2026-10-02T06:00:00Z'));
    expect(end.toISOString()).toBe('2026-11-02T06:00:00.000Z');
  });

  it('clamps to the end of a shorter month', () => {
    const end = computeBillingPeriodEnd('monthly', new Date('2027-01-31T06:00:00Z'));
    expect(end.toISOString()).toBe('2027-02-28T06:00:00.000Z');
  });
});
