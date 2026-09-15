/**
 * Different hosts store multi-line env vars differently — some platforms'
 * dashboards keep real line breaks, others flatten to literal "\n", and a
 * value pasted with surrounding quotes is an easy mistake. Normalize all of
 * that so a valid PEM key is accepted regardless of how it got here.
 */
function normalizePrivateKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const unquoted = raw.trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
  return unquoted.replace(/\\n/g, '\n');
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
    privateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '30d',
  },

  voicensms: {
    apiKey: process.env.VOICENSMS_API_KEY,
    templateId: process.env.VOICENSMS_TEMPLATE_ID,
    senderId: process.env.VOICENSMS_SENDER_ID,
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

  credits: {
    freeMessageCredits: Number(process.env.FREE_MESSAGE_CREDITS ?? 10),
  },

  reportPrice: {
    amount: process.env.REPORT_PRICE_AMOUNT ? Number(process.env.REPORT_PRICE_AMOUNT) : undefined,
    currency: process.env.REPORT_PRICE_CURRENCY,
  },
};
