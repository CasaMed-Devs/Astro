/**
 * Different hosts store multi-line env vars differently — some platforms'
 * dashboards keep real line breaks, others flatten to literal "\n", and a
 * value pasted with surrounding quotes is an easy mistake. Normalize all of
 * that so a valid PEM key is accepted regardless of how it got here.
 */
function normalizePrivateKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let key = raw.trim();
  while (/^(['"])[\s\S]*\1$/.test(key)) {
    key = key.slice(1, -1).trim();
  }
  return key.replace(/\\r\\n|\\n|\\r/g, '\n').replace(/\r\n/g, '\n');
}

/**
 * FIREBASE_PRIVATE_KEY_B64 (the private key, base64-encoded) sidesteps every
 * quoting/newline-mangling issue a dashboard or shell can introduce, since a
 * base64 string has no quotes, newlines, or other special characters left to
 * corrupt. Prefer it when set; fall back to the raw/escaped key otherwise.
 */
function resolvePrivateKey(): string | undefined {
  const b64 = process.env.FIREBASE_PRIVATE_KEY_B64?.trim();
  if (b64) {
    return normalizePrivateKey(Buffer.from(b64, 'base64').toString('utf8'));
  }
  return normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
}

/**
 * Central place to read environment configuration. Nothing here throws at
 * import time — individual services validate the specific vars they need
 * lazily, so the server can boot (and unrelated routes keep working) even
 * before Razorpay/AI-provider credentials are supplied.
 */
export const env = {
  port: Number(process.env.PORT ?? 3000),

  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: resolvePrivateKey(),
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '30d',
  },

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  },

  ai: {
    provider: process.env.AI_PROVIDER as 'openai' | 'anthropic' | undefined,
    openaiApiKey: process.env.OPENAI_API_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  },

  astrology: {
    freeAstrologyApiKey: process.env.FREE_ASTROLOGY_API_KEY,
  },

  google: {
    placesApiKey: process.env.GOOGLE_PLACES_API_KEY,
  },

  personaApi: {
    apiKey: process.env.PERSONA_API_KEY,
  },

  credits: {
    freeMessageCredits: Number(process.env.FREE_MESSAGE_CREDITS ?? 10),
  },

  devLogin: {
    // Opt-in only, off by default everywhere including local dev — never
    // enabled by NODE_ENV/deploy-target guesswork. Set ENABLE_DEV_LOGIN=true
    // locally to expose a phone/OTP skip for manual testing.
    enabled: process.env.ENABLE_DEV_LOGIN === 'true',
    testPhoneNumber: process.env.DEV_LOGIN_PHONE ?? '+911234567890',
  },

  reportPrice: {
    amount: process.env.REPORT_PRICE_AMOUNT ? Number(process.env.REPORT_PRICE_AMOUNT) : undefined,
    currency: process.env.REPORT_PRICE_CURRENCY,
  },
};
