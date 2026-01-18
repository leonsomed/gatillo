export type ErrorType = "AuthError" | "InvalidRequestError";

export class AuthError extends Error {
  code = "AuthError";
  httpStatusCode = 401;

  constructor() {
    super("Requires authentication");
  }
}

export class InvalidRequestError extends Error {
  code = "InvalidRequestError";
  httpStatusCode = 422;

  constructor() {
    super("Invalid request");
  }
}

type ReportErrorOptions = {
  source?: string;
  details?: Record<string, unknown>;
};

function formatUnknownError(error: unknown) {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === "string") {
    return new Error(error);
  }
  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error("Unknown error");
  }
}

export async function reportError(
  error: unknown,
  options: ReportErrorOptions = {},
) {
  const normalizedError = formatUnknownError(error);
  const summary = options.source
    ? `Error in ${options.source}`
    : "Unhandled error";
  console.error(summary, normalizedError);

  const payload = {
    message: normalizedError.message,
    stack: normalizedError.stack?.toString() ?? null,
    options,
  };

  if (process.env.NODE_ENV === "production") {
    // TODO send email
    console.error(JSON.stringify(payload, null, 2));
  }
}
