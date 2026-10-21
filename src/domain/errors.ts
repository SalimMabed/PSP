export type DomainErrorCode =
  | "INVALID_TRANSITION"
  | "METHOD_REQUIRED"
  | "NOT_REFUNDABLE"
  | "REFUND_EXCEEDS_REMAINING"
  | "INVALID_AMOUNT"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "MERCHANT_INACTIVE"
  | "NOTHING_TO_SETTLE"
  | "INVALID_STATE"
  | "VALIDATION";

/** Expected business error (message intended for the user, in English). */
export class DomainError extends Error {
  readonly code: DomainErrorCode;
  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}
