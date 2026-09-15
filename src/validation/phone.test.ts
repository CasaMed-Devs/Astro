import { isValidIndianMobileNumber, toE164 } from './phone';

describe('isValidIndianMobileNumber', () => {
  it('accepts a valid 10-digit number starting with 6-9', () => {
    expect(isValidIndianMobileNumber('9876543210')).toBe(true);
    expect(isValidIndianMobileNumber('6000000000')).toBe(true);
  });

  it('rejects numbers that are too short or too long', () => {
    expect(isValidIndianMobileNumber('98765432')).toBe(false);
    expect(isValidIndianMobileNumber('987654321099')).toBe(false);
  });

  it('rejects numbers starting with 0-5', () => {
    expect(isValidIndianMobileNumber('5876543210')).toBe(false);
  });

  it('rejects non-numeric input', () => {
    expect(isValidIndianMobileNumber('98765abcde')).toBe(false);
  });

  it('trims surrounding whitespace before validating', () => {
    expect(isValidIndianMobileNumber('  9876543210  ')).toBe(true);
  });
});

describe('toE164', () => {
  it('prefixes the default country code', () => {
    expect(toE164('9876543210')).toBe('+919876543210');
  });

  it('accepts a custom country code', () => {
    expect(toE164('5551234567', '+1')).toBe('+15551234567');
  });
});
