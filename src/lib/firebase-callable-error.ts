/** Formats errors from local operations without referring to cloud accounts. */
export function getCallableErrorMessage(error: unknown, fallbackMessage: string, _operationName?: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message.trim()) return error.message;
  return fallbackMessage;
}
