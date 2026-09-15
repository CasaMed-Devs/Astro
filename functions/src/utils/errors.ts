export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Please sign in again to continue.') {
    super(401, message);
  }
}

export class InsufficientCreditsError extends HttpError {
  constructor(message = "You're out of free messages. Upgrade to Astro101 Plus to keep chatting.") {
    super(402, message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not found.') {
    super(404, message);
  }
}

export class AiProviderNotConfiguredError extends HttpError {
  constructor() {
    super(503, 'The AI astrologer is temporarily unavailable. Please try again later.');
  }
}

export class PaymentVerificationError extends HttpError {
  constructor(message = 'Payment could not be verified.') {
    super(400, message);
  }
}

export class ValidationError extends HttpError {
  constructor(message: string) {
    super(400, message);
  }
}

export class AstrologyApiNotConfiguredError extends HttpError {
  constructor() {
    super(503, 'Kundali calculation is temporarily unavailable. Please try again later.');
  }
}
