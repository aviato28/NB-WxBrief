/** HTTP helper for server-side provider calls. */

export class UpstreamHttpError extends Error {
  readonly status: number;
  readonly provider: string;

  constructor(provider: string, status: number, message: string) {
    super(message);
    this.name = "UpstreamHttpError";
    this.provider = provider;
    this.status = status;
  }
}

export interface FetchJsonOptions {
  readonly provider: string;
  readonly url: string;
  readonly timeoutMs?: number;
  readonly headers?: HeadersInit;
  /** Retry once on transient upstream failures (502/503/504). */
  readonly retryTransient?: boolean;
}

const DEFAULT_TIMEOUT_MS = 12_000;
const TRANSIENT_STATUS = new Set([502, 503, 504]);

async function fetchJsonOnce<T>(options: FetchJsonOptions): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  try {
    const response = await fetch(options.url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...options.headers,
      },
      cache: "no-store",
    });

    if (response.status === 204) {
      return null;
    }

    if (!response.ok) {
      throw new UpstreamHttpError(
        options.provider,
        response.status,
        `${options.provider} responded ${response.status} for ${options.url}`,
      );
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchJson<T>(options: FetchJsonOptions): Promise<T | null> {
  try {
    return await fetchJsonOnce<T>(options);
  } catch (error) {
    const shouldRetry =
      options.retryTransient !== false &&
      error instanceof UpstreamHttpError &&
      TRANSIENT_STATUS.has(error.status);

    if (shouldRetry) {
      await new Promise((resolve) => {
        setTimeout(resolve, 400);
      });
      return fetchJsonOnce<T>(options);
    }
    throw error;
  }
}

/**
 * Soft fetch for non-critical products (SIGMETs, winds samples).
 * Returns null on any failure so briefings can degrade instead of hard-fail.
 */
export async function fetchJsonSoft<T>(
  options: FetchJsonOptions,
): Promise<T | null> {
  try {
    return await fetchJson<T>(options);
  } catch (error) {
    console.warn(
      `[${options.provider}] soft-fail:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
