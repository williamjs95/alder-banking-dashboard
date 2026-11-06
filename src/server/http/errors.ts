/** An expected failure with a stable machine-readable code and an HTTP status. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what: string) =>
  new AppError("not_found", 404, `${what} was not found.`);

export const invalid = (message: string, fields?: Record<string, string>) =>
  new AppError("validation_error", 422, message, fields);

export const conflict = (message: string) =>
  new AppError("conflict", 409, message);

export const insufficientFunds = (accountName: string) =>
  new AppError(
    "insufficient_funds",
    422,
    `${accountName} does not have enough available funds.`,
    { amountCents: "Amount exceeds the available balance" },
  );
