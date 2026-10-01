import request from 'supertest';

const TEST_PHONE = '+919999999955';
process.env.TEST_ACCOUNT_PHONE = TEST_PHONE;
process.env.TEST_ACCOUNT_OTP = '123456';
process.env.TEST_ACCOUNT_CREDITS = '1000';
process.env.JWT_SECRET = 'test_jwt_secret';

const userDocs = new Map<string, Record<string, unknown>>();

function fakeFirestore() {
  const docRef = (id: string) => ({
    get: async () => ({ exists: userDocs.has(id), data: () => userDocs.get(id) }),
    set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
      userDocs.set(id, opts?.merge ? { ...userDocs.get(id), ...data } : data);
    },
  });
  return {
    collection: () => ({ doc: docRef }),
    runTransaction: async (fn: (tx: unknown) => Promise<void>) =>
      fn({
        get: (ref: ReturnType<typeof docRef>) => ref.get(),
        set: (ref: ReturnType<typeof docRef>, data: Record<string, unknown>, opts?: { merge?: boolean }) =>
          ref.set(data, opts),
      }),
  };
}

jest.mock('../config/firebase-admin', () => ({
  adminFirestore: () => fakeFirestore(),
  adminMessaging: jest.fn(),
}));
jest.mock('../services/userProfile.service', () => ({
  createUserProfile: jest.fn(async () => 'profile-1'),
}));
jest.mock('../services/pixyAuth.service', () => {
  const actual = jest.requireActual('../services/pixyAuth.service');
  return { ...actual, pixyLogin: jest.fn(), pixyVerifyOtp: jest.fn() };
});

import { createApp } from '../app';
import { pixyLogin, pixyVerifyOtp } from '../services/pixyAuth.service';
import { verifySessionToken } from '../services/token.service';

describe('test account auth', () => {
  beforeEach(() => userDocs.clear());

  it('send-otp returns the fixed OTP without calling the OTP provider', async () => {
    const res = await request(createApp()).post('/auth/send-otp').send({ phoneNumber: TEST_PHONE });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sent: true, otp: '123456' });
    expect(pixyLogin).not.toHaveBeenCalled();
  });

  it('verify-otp signs in with the fixed OTP and seeds an active subscription + credits', async () => {
    const app = createApp();
    const send = await request(app).post('/auth/send-otp').send({ phoneNumber: TEST_PHONE });
    const res = await request(app)
      .post('/auth/verify-otp')
      .send({ phoneNumber: TEST_PHONE, code: '123456', identificationToken: send.body.identificationToken });

    expect(res.status).toBe(200);
    expect(res.body.isNewUser).toBe(true);
    expect(verifySessionToken(res.body.token)).toEqual({ uid: TEST_PHONE, phoneNumber: TEST_PHONE });
    expect(pixyVerifyOtp).not.toHaveBeenCalled();
    expect(userDocs.get(TEST_PHONE)).toMatchObject({ credits: 1000, mandateStatus: 'active' });
  });

  it('rejects a wrong OTP for the test account', async () => {
    const res = await request(createApp())
      .post('/auth/verify-otp')
      .send({ phoneNumber: TEST_PHONE, code: '654321', identificationToken: 'test-account' });
    expect(res.status).toBe(400);
    expect(userDocs.has(TEST_PHONE)).toBe(false);
  });

  it('does not reset credits above the floor on later logins', async () => {
    userDocs.set(TEST_PHONE, { credits: 5000, mandateStatus: 'cancelled' });
    const res = await request(createApp())
      .post('/auth/verify-otp')
      .send({ phoneNumber: TEST_PHONE, code: '123456', identificationToken: 'test-account' });
    expect(res.status).toBe(200);
    expect(userDocs.get(TEST_PHONE)).toMatchObject({ credits: 5000, mandateStatus: 'active' });
  });

  it('other numbers still go through the real OTP provider, not the fixed OTP', async () => {
    (pixyVerifyOtp as jest.Mock).mockRejectedValueOnce(new Error('bad otp'));
    const res = await request(createApp())
      .post('/auth/verify-otp')
      .send({ phoneNumber: '+918888888888', code: '123456', identificationToken: 'x' });
    expect(pixyVerifyOtp).toHaveBeenCalled();
    expect(res.status).toBe(500);
    expect(userDocs.has('+918888888888')).toBe(false);
  });
});
