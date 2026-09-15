import { AppError, toAppError } from './errors';

describe('toAppError', () => {
  it('passes through an existing AppError unchanged', () => {
    const original = new AppError('api/unauthorized', 'bad code');
    expect(toAppError(original)).toBe(original);
  });

  it('detects a generic network error by message', () => {
    const error = toAppError(new Error('Network request failed'));
    expect(error.code).toBe('network/no-connection');
  });

  it('falls back to unknown for anything else', () => {
    const error = toAppError('a random string');
    expect(error.code).toBe('unknown');
  });

  it('falls back to unknown for an unrecognized error-shaped object', () => {
    const error = toAppError({ code: 'something/unexpected' });
    expect(error.code).toBe('unknown');
  });
});
