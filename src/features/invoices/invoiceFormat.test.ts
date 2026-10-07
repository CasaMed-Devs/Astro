import {
  formatInvoiceAmount,
  formatInvoiceDate,
  formatPhoneNumber,
  toLocalPhoneNumber,
} from '@/features/invoices/invoiceFormat';

describe('formatInvoiceDate', () => {
  it('formats in Indian time regardless of the device timezone', () => {
    expect(formatInvoiceDate('2026-10-01T06:00:00.000Z')).toBe('01 Oct 2026');
    // 20:00 UTC is already the next day in India.
    expect(formatInvoiceDate('2026-09-30T20:00:00.000Z')).toBe('01 Oct 2026');
  });
});

describe('formatInvoiceAmount', () => {
  it('always shows two decimals', () => {
    expect(formatInvoiceAmount(49)).toBe('Rs 49.00');
    expect(formatInvoiceAmount(3.74)).toBe('Rs 3.74');
  });
});

describe('phone formatting', () => {
  it('spaces out an Indian number for display', () => {
    expect(formatPhoneNumber('+919876543210')).toBe('+91 9876543210');
  });

  it('drops the country code for the local form', () => {
    expect(toLocalPhoneNumber('+919876543210')).toBe('9876543210');
  });

  it('leaves other numbers untouched', () => {
    expect(formatPhoneNumber('+14155550100')).toBe('+14155550100');
    expect(toLocalPhoneNumber('+14155550100')).toBe('+14155550100');
  });
});
