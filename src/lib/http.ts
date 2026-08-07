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
}

const DEFAULT_TIMEOUT_MS = 12_000;

export async function fetchJson<T>(options: FetchJsonOptions): Promise<T | null> {
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
      // Always revalidate for operational weather freshness at the service cache layer.
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
