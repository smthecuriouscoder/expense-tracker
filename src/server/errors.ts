/** Errors whose message is safe to show to the user. Anything else is reported as a generic failure. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly code: "forbidden" | "not_found" | "invalid" | "rate_limited" = "invalid",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const forbidden = (message = "You don't have access to this.") => new AppError(message, "forbidden");
export const notFound = (message = "Not found.") => new AppError(message, "not_found");
export const invalid = (message: string) => new AppError(message, "invalid");

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Runs a server-side operation and converts AppErrors into a serializable result for the client. */
export async function toResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    console.error(err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
