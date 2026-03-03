export function publicErrorMessage(
  error: unknown,
  fallbackMessage = "Request failed",
) {
  if (process.env.NODE_ENV === "production") {
    return fallbackMessage;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallbackMessage;
}
