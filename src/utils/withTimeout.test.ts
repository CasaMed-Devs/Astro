import { AppError } from './errors';
import { withTimeout } from './withTimeout';

describe('withTimeout', () => {
  it('resolves with the original value when the promise finishes first', async () => {
    const fast = new Promise<string>((resolve) => setTimeout(() => resolve('done'), 10));
    await expect(withTimeout(fast, 1000, 'too slow')).resolves.toBe('done');
  });

  it('rejects with an AppError once the timeout elapses, even if the promise never settles', async () => {
    const neverSettles = new Promise<string>(() => {});
    await expect(withTimeout(neverSettles, 10, 'too slow')).rejects.toBeInstanceOf(AppError);
  });

  it('propagates the original rejection when the promise fails before the timeout', async () => {
    const fails = Promise.reject(new Error('boom'));
    await expect(withTimeout(fails, 1000, 'too slow')).rejects.toThrow('boom');
  });
});
