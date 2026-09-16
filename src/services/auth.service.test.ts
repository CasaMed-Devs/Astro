import { sendOtp, confirmOtp, signOut, subscribeToAuthState } from './auth.service';
import { AppError } from '@/utils/errors';

const mockApiClientPost = jest.fn();
const mockSetSession = jest.fn();
const mockClearSession = jest.fn();
const mockSubscribeToSession = jest.fn();
const mockLoadSession = jest.fn();
const mockGetSession = jest.fn();

jest.mock('@/services/apiClient', () => ({
  apiClient: { post: (...args: unknown[]) => mockApiClientPost(...args) },
}));

jest.mock('@/services/session', () => ({
  setSession: (...args: unknown[]) => mockSetSession(...args),
  clearSession: (...args: unknown[]) => mockClearSession(...args),
  subscribeToSession: (...args: unknown[]) => mockSubscribeToSession(...args),
  loadSession: (...args: unknown[]) => mockLoadSession(...args),
  getSession: (...args: unknown[]) => mockGetSession(...args),
}));

describe('sendOtp', () => {
  it('asks the backend to send an OTP and returns the identification token and OTP', async () => {
    mockApiClientPost.mockResolvedValueOnce({
      sent: true,
      identificationToken: 'ident-1',
      otp: '522643',
    });

    const result = await sendOtp('+919876543210');

    expect(mockApiClientPost).toHaveBeenCalledWith('/auth/send-otp', {
      phoneNumber: '+919876543210',
    });
    expect(result).toEqual({ identificationToken: 'ident-1', otp: '522643' });
  });

  it('wraps a backend error into an AppError', async () => {
    mockApiClientPost.mockRejectedValueOnce(new AppError('api/unknown', 'boom'));

    await expect(sendOtp('123')).rejects.toBeInstanceOf(AppError);
  });
});

describe('confirmOtp', () => {
  it('verifies the code and starts a session on success', async () => {
    mockApiClientPost.mockResolvedValueOnce({ token: 'jwt-1', uid: 'uid-1' });

    const result = await confirmOtp('+919876543210', '123456', 'ident-1');

    expect(mockApiClientPost).toHaveBeenCalledWith('/auth/verify-otp', {
      phoneNumber: '+919876543210',
      code: '123456',
      identificationToken: 'ident-1',
    });
    expect(mockSetSession).toHaveBeenCalledWith({
      token: 'jwt-1',
      uid: 'uid-1',
      phoneNumber: '+919876543210',
    });
    expect(result).toEqual({ token: 'jwt-1', uid: 'uid-1', phoneNumber: '+919876543210' });
  });

  it('wraps an invalid-code error into an AppError and does not start a session', async () => {
    mockApiClientPost.mockRejectedValueOnce(new AppError('api/unknown', 'incorrect code'));

    await expect(confirmOtp('+919876543210', '000000', 'ident-1')).rejects.toBeInstanceOf(AppError);
    expect(mockSetSession).not.toHaveBeenCalled();
  });
});

describe('signOut', () => {
  it('clears the persisted session', async () => {
    mockClearSession.mockResolvedValueOnce(undefined);
    await signOut();
    expect(mockClearSession).toHaveBeenCalled();
  });
});

describe('subscribeToAuthState', () => {
  it('registers the callback with the session store', () => {
    const callback = jest.fn();
    const unsubscribe = jest.fn();
    mockSubscribeToSession.mockReturnValueOnce(unsubscribe);

    const result = subscribeToAuthState(callback);

    expect(mockSubscribeToSession).toHaveBeenCalledWith(callback);
    expect(result).toBe(unsubscribe);
  });
});
