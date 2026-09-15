import express from 'express';
import request from 'supertest';

import { errorHandler } from './errorHandler';

jest.mock('../services/token.service', () => ({
  verifySessionToken: jest.fn(),
}));

async function buildApp() {
  const { requireAuth } = await import('./auth.middleware');
  const app = express();
  app.get('/protected', requireAuth, (req, res) => res.json({ uid: req.uid }));
  app.use(errorHandler);
  return app;
}

describe('requireAuth', () => {
  it('rejects a request with no Authorization header', async () => {
    const app = await buildApp();
    const response = await request(app).get('/protected');
    expect(response.status).toBe(401);
  });

  it('rejects a request with an invalid token', async () => {
    const { verifySessionToken } = await import('../services/token.service');
    (verifySessionToken as jest.Mock).mockImplementation(() => {
      throw new Error('invalid token');
    });

    const app = await buildApp();
    const response = await request(app).get('/protected').set('Authorization', 'Bearer bad-token');
    expect(response.status).toBe(401);
  });

  it('attaches the decoded uid for a valid token', async () => {
    const { verifySessionToken } = await import('../services/token.service');
    (verifySessionToken as jest.Mock).mockReturnValue({ uid: 'user-123', phoneNumber: '+919876543210' });

    const app = await buildApp();
    const response = await request(app).get('/protected').set('Authorization', 'Bearer good-token');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ uid: 'user-123' });
  });
});
