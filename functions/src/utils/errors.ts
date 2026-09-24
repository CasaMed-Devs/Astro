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
  constructor(message = "You're out of free messages. Upgrade to Astro108 Plus to keep chatting.") {
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

export class GooglePlacesNotConfiguredError extends HttpError {
  constructor() {
    super(503, 'Place search is temporarily unavailable. Please try again later.');
  }
}

export class PersonaApiNotConfiguredError extends HttpError {
  constructor() {
    super(503, 'The astrologer chat is temporarily unavailable. Please try again later.');
  }
}

export class PersonaInvalidKeyError extends HttpError {
  constructor() {
    super(502, 'The astrologer chat is temporarily unavailable. Please try again later.');
  }
}

export class PersonaNotEnabledError extends HttpError {
  constructor() {
    super(404, 'This astrologer is not available right now.');
  }
}

export class PersonaMissingContextError extends HttpError {
  constructor(message = 'Please provide the required details for this astrologer.') {
    super(400, message);
  }
}

export class PersonaConversationNotFoundError extends HttpError {
  constructor() {
    super(404, 'Chat not found.');
  }
}

export class PersonaConversationExistsError extends HttpError {
  constructor() {
    super(409, 'This chat already exists.');
  }
}

export class PersonaConversationBlockedError extends HttpError {
  constructor() {
    super(403, 'This conversation is blocked.');
  }
}

export class PersonaAccountDisabledError extends HttpError {
  constructor() {
    super(403, 'This account is disabled. Please contact support.');
  }
}

export class PersonaUpstreamError extends HttpError {
  constructor() {
    super(502, 'The astrologer is briefly unavailable. Please try again.');
  }
}
