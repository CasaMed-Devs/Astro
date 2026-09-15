import request from 'supertest';

jest.mock('./config/firebase-admin', () => ({
  adminFirestore: jest.fn(),
  adminMessaging: jest.fn(),
}));

jest.mock('./services/token.service', () => ({
  verifySessionToken: jest.fn(() => {
    throw new Error('no token');
  }),
}));

describe('app', () => {
  it('GET /health responds ok without authentication', async () => {
    const { createApp } = await import('./app');
    const response = await request(createApp()).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('rejects an unauthenticated request to a protected route', async () => {
    const { createApp } = await import('./app');
    const response = await request(createApp())
      .post('/chats/chat1/messages')
      .send({ personaId: 'meera-iyer', text: 'hi' });
    expect(response.status).toBe(401);
  });

  it('returns 404 for an unknown route', async () => {
    const { createApp } = await import('./app');
    const response = await request(createApp()).get('/does-not-exist');
    expect(response.status).toBe(404);
  });
});
