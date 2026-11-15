/**
 * Network utilities for fetching Movember pages via proxy
 */

import { Option, Schema } from "effect";

import {
  getProxyUrl,
  MOVEMBER_BASE_URL_TEMPLATE,
  MOVEMBER_TEAM_URL_TEMPLATE,
} from "../constants.js";
import { trackNetworkError } from "../error-tracking.js";
import { logger } from "../logger.js";
import { URL_PATTERNS } from "../regex-patterns.js";

const proxyErrorSchema = Schema.Struct({
  message: Schema.optionalKey(Schema.String),
  upstreamStatus: Schema.optionalKey(Schema.Number),
});

/** Failed proxy request with an upstream HTTP status when available. */
export class ProxyRequestError extends Error {
  /** Upstream status or the proxy's own status. */
  readonly status: number;

  /**
   * Retain a validated proxy failure.
   * @param message - Failure description.
   * @param status - Upstream or proxy HTTP status.
   */
  constructor(message: string, status: number) {
    super(message);
    this.name = "ProxyRequestError";
    this.status = status;
  }
}

/** HTML response and the destination after validated proxy redirects. */
export interface FetchResult {
  html: string;
  finalUrl: string;
}

/**
 * Extract subdomain from a Movember URL
 * @param url - The Movember URL
 * @returns The subdomain (e.g., "uk", "au", "us") or null if not found
 */
export const extractSubdomainFromUrl = (url: string): string | null => {
  const match = url.match(URL_PATTERNS.SUBDOMAIN);

  return match ? match[1] : null;
};

/**
 * Fetch HTML using Worker's CORS proxy
 * Returns both HTML and the final URL after redirects
 * @param url - The URL to fetch
 * @returns The HTML content and final URL
 * @param signal - Cancels the upstream request.
 * @throws {Error} If the proxy request fails
 */
export const fetchViaProxy = async (
  url: string,
  signal?: AbortSignal
): Promise<FetchResult> => {
  const proxyUrl = `${getProxyUrl()}?url=${encodeURIComponent(url)}`;

  const response = await fetch(proxyUrl, {
    signal:
      signal === undefined
        ? AbortSignal.timeout(20_000)
        : AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
  });

  if (!response.ok) {
    // Try to get error message from response
    let errorMessage = `Proxy error! status: ${response.status}`;
    let { status } = response;

    try {
      const contentType = response.headers.get("content-type");

      if (contentType?.includes("application/json") === true) {
        const errorData = Schema.decodeUnknownOption(proxyErrorSchema)(
          await response.json()
        );

        if (Option.isSome(errorData) && errorData.value.message !== undefined) {
          errorMessage = errorData.value.message;
        }

        if (
          Option.isSome(errorData) &&
          errorData.value.upstreamStatus !== undefined
        ) {
          status = errorData.value.upstreamStatus;
        }
      } else {
        const errorText = await response.text();

        if (errorText) {
          errorMessage = errorText.slice(0, 200);
        }
      }
    } catch (caughtError) {
      // Ignore parse errors, use default error message
      logger.warn("[PROXY]", "Could not parse error response:", caughtError);
    }

    const error = new ProxyRequestError(errorMessage, status);
    // Track network error with structured context
    trackNetworkError(error, {
      url,
      metadata: {
        status,
        proxyStatus: response.status,
        statusText: response.statusText,
      },
    });

    throw error;
  }

  // Worker proxy returns HTML directly
  const html = await response.text();
  // Get final URL after redirects from response header
  const finalUrl = response.headers.get("X-Final-URL") ?? url;

  return { html, finalUrl };
};

/**
 * Build Movember URL with correct subdomain for a member
 * @param memberId - The member ID
 * @param subdomain - The subdomain to use
 * @returns The complete Movember URL
 */
export const buildMovemberUrl = (
  memberId: string,
  subdomain: string
): string => {
  const baseUrl = MOVEMBER_BASE_URL_TEMPLATE.replace("{subdomain}", subdomain);

  return `${baseUrl}?memberId=${memberId}`;
};

/**
 * Build Movember team URL with correct subdomain for a team
 * @param teamId - The team ID
 * @param subdomain - The subdomain to use
 * @returns The complete Movember team URL
 */
export const buildTeamUrl = (teamId: string, subdomain: string): string => {
  const baseUrl = MOVEMBER_TEAM_URL_TEMPLATE.replace("{subdomain}", subdomain);

  return baseUrl.replace("{id}", teamId);
};
