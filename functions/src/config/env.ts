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
  const b64 = process.env.SERVICE_ACCOUNT_PRIVATE_KEY_B64?.trim();
  if (b64) {
    return normalizePrivateKey(Buffer.from(b64, 'base64').toString('utf8'));
  }
  return normalizePrivateKey(process.env.SERVICE_ACCOUNT_PRIVATE_KEY);
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
    clientEmail: process.env.SERVICE_ACCOUNT_EMAIL,
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

  // All amounts in this file (reportPrice, topUp, trial/subscription, and the
  // Firestore-backed appConfig/paywallPricing doc they fall back to) are in
  // whole Rupees, not paise. Razorpay's API requires paise — that conversion
  // happens only at the single call site that talks to Razorpay (see
  // rupeesToPaise in services/razorpay.service.ts), never anywhere else.
  reportPrice: {
    amount: process.env.REPORT_PRICE_AMOUNT ? Number(process.env.REPORT_PRICE_AMOUNT) : undefined,
    currency: process.env.REPORT_PRICE_CURRENCY,
  },

  // Wallet top-up defaults, used until an admin sets appConfig/paywallPricing.topUp.
  topUp: {
    minAmount: process.env.TOPUP_MIN_AMOUNT ? Number(process.env.TOPUP_MIN_AMOUNT) : 50, // Rupees
    maxAmount: process.env.TOPUP_MAX_AMOUNT ? Number(process.env.TOPUP_MAX_AMOUNT) : 5000, // Rupees
    currency: process.env.TOPUP_CURRENCY ?? 'INR',
  },

  // Single global "price of 1 credit" — drives top-up conversion and how
  // many credits a mandate charge grants. Admin-editable via the dashboard.
  creditPricing: {
    rupeesPerCredit: process.env.RUPEES_PER_CREDIT ? Number(process.env.RUPEES_PER_CREDIT) : 1,
  },

  // The Rs.1 trial mandate-registration charge and the Rs.299 recurring
  // auto-debit amount, both admin-editable via appConfig/paywallPricing.
  trialAmount: {
    amount: process.env.TRIAL_AMOUNT ? Number(process.env.TRIAL_AMOUNT) : 1,
    currency: process.env.TRIAL_CURRENCY ?? 'INR',
  },
  subscriptionAmount: {
    amount: process.env.SUBSCRIPTION_AMOUNT ? Number(process.env.SUBSCRIPTION_AMOUNT) : 299,
    currency: process.env.SUBSCRIPTION_CURRENCY ?? 'INR',
  },

  admin: {
    password: process.env.ADMIN_PASSWORD,
    // Origin of the standalone admin-dashboard app (e.g.
    // http://localhost:5174 locally, or its deployed URL) — required for
    // the cross-origin cookie session to work at all (browsers refuse
    // credentialed CORS against a wildcard origin).
    dashboardOrigin: process.env.ADMIN_DASHBOARD_ORIGIN,
  },
};
