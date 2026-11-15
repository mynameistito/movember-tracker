/** Upstream HTTP failure, retaining the status for proxy clients. */
export class MovemberHttpError extends Error {
  /** HTTP status returned by Movember. */
  readonly status: number;

  /**
   * Preserve an upstream failure for the proxy response.
   * @param status - HTTP status returned by Movember.
   */
  constructor(status: number) {
    super(`Movember returned HTTP ${status}`);
    this.name = "MovemberHttpError";
    this.status = status;
  }
}

const validateDestination = (url: URL): void => {
  if (url.protocol !== "https:" || !url.hostname.endsWith(".movember.com")) {
    throw new Error("Only HTTPS Movember pages are allowed");
  }

  if (url.username !== "" || url.password !== "" || url.port !== "") {
    throw new Error("Only HTTPS Movember pages are allowed");
  }
};

/**
 * Fetch a Movember page within one timeout budget, validating every redirect.
 * @param input - Initial HTTPS Movember URL.
 * @param requestSignal - Cancels upstream work when the caller disconnects.
 * @returns HTML and the validated final destination.
 */
export const fetchMovemberPage = async (
  input: string,
  requestSignal?: AbortSignal
): Promise<{ html: string; finalUrl: string }> => {
  const timeout = AbortSignal.timeout(15_000);

  const signal =
    requestSignal === undefined
      ? timeout
      : AbortSignal.any([requestSignal, timeout]);

  const visit = async (
    url: URL,
    redirects: number
  ): Promise<{ html: string; finalUrl: string }> => {
    validateDestination(url);

    const response = await fetch(url, {
      redirect: "manual",
      signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("Location");
      await response.body?.cancel();

      if (location === null || location === "") {
        throw new Error("Movember redirect has no destination");
      }

      if (redirects === 5) {
        throw new Error("Movember redirected too many times");
      }

      return await visit(new URL(location, url), redirects + 1);
    }

    if (!response.ok) {
      await response.body?.cancel();
      throw new MovemberHttpError(response.status);
    }

    return { html: await response.text(), finalUrl: url.href };
  };

  return await visit(new URL(input), 0);
};
