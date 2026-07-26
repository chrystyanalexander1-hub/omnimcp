export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidEntityError extends DomainError {
  constructor(message: string) {
    super(message, "INVALID_ENTITY");
  }
}

/** Thrown by application use cases when a permission or plan check fails. Kept in domain so both application and interface layers can catch it by type. */
export class PermissionDeniedError extends DomainError {
  constructor(message: string) {
    super(message, "PERMISSION_DENIED");
  }
}

/** Thrown when a tool marked `sensitive` is invoked without an explicit confirmation token. */
export class ConfirmationRequiredError extends DomainError {
  constructor(message: string) {
    super(message, "CONFIRMATION_REQUIRED");
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message, "NOT_FOUND");
  }
}

export class RateLimitExceededError extends DomainError {
  constructor(message: string) {
    super(message, "RATE_LIMITED");
  }
}
