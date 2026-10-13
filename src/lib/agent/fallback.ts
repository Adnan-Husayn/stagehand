import { QlooError } from "../qloo/client";

export interface Attempt<T> {
  name: string;
  run: () => Promise<T>;
}

export interface FallbackOutcome<T> {
  value: T;
  /** Name of the strategy whose result was used. */
  strategy: string;
  /** One line per attempt, in order, for the activity trace. */
  attempts: string[];
}

/**
 * Only bad-parameter and not-found responses move on to the next strategy.
 * Auth, quota and outage errors are not retried with other strategies.
 */
export function isFallbackError(err: unknown): boolean {
  return err instanceof QlooError && (err.status === 400 || err.status === 404);
}

/**
 * Runs strategies in order and returns the first non-empty result. If every strategy
 * returns empty, the last empty result is returned. If every strategy errors, the last error is thrown.
 */
export async function firstUsable<T>(attempts: Attempt<T>[], isEmpty: (value: T) => boolean): Promise<FallbackOutcome<T>> {
  const log: string[] = [];
  let lastEmpty: { value: T; strategy: string } | null = null;
  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      const value = await attempt.run();
      if (!isEmpty(value)) {
        log.push(`${attempt.name}: results`);
        return { value, strategy: attempt.name, attempts: log };
      }
      log.push(`${attempt.name}: no results`);
      lastEmpty = { value, strategy: attempt.name };
    } catch (err) {
      if (!isFallbackError(err)) throw err;
      log.push(`${attempt.name}: error ${(err as QlooError).status}`);
      lastError = err;
    }
  }
  if (lastEmpty) return { ...lastEmpty, attempts: log };
  throw lastError ?? new Error("No strategy was available.");
}
