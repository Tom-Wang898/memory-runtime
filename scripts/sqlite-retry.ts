const DEFAULT_ATTEMPTS = 4;
const DEFAULT_DELAY_MS = 150;

const sleep = async (delayMs: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
};

const isDatabaseLockedError = (error: unknown): boolean =>
  error instanceof Error &&
  /database is locked/i.test(error.message);

export const runWithDatabaseRetry = async <TResult>(
  operation: () => Promise<TResult>,
  attempts = DEFAULT_ATTEMPTS,
  delayMs = DEFAULT_DELAY_MS,
): Promise<TResult> => {
  let lastError: unknown = null;
  for (let index = 0; index < attempts; index += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isDatabaseLockedError(error) || index === attempts - 1) {
        throw error;
      }
      await sleep(delayMs);
    }
  }
  throw lastError;
};
