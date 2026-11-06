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
 * @returns HTML and the validated final destination.
 */
export const fetchMovemberPage = async (
  input: string
): Promise<{ html: string; finalUrl: string }> => {
  const signal = AbortSignal.timeout(15_000);

  const visit = async (
    url: URL,
    redirects: number
  ): Promise<{ html: string; finalUrl: string }> => {
    validateDestination(url);

    const response = await fetch(url, {
      redirect: "manual",
      signal,
      headers: { Accept: "text/html" },
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
