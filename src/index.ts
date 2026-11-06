import type { Fetcher } from "@cloudflare/workers-types";

import { fetchMovemberPage, MovemberHttpError } from "./movember-proxy.js";

// Best-effort per-isolate protection; this is not a distributed quota.
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const windowMs = 60_000;
const maxRequests = 100;

const exceedsRateLimit = (request: Request): boolean => {
  const key = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const now = Date.now();

  if (rateLimits.size > 1000) {
    for (const [ip, record] of rateLimits) {
      if (record.resetAt <= now) {
        rateLimits.delete(ip);
      }
    }
  }

  const record = rateLimits.get(key);

  if (!record || record.resetAt <= now) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs });

    return false;
  }

  record.count += 1;

  return record.count > maxRequests;
};

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",

  "Access-Control-Max-Age": "86400",
});

const requestOrigin = (request: Request): string | null => {
  const value = request.headers.get("Origin") ?? request.headers.get("Referer");

  if (value === null) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const proxy = async (request: Request, url: URL): Promise<Response> => {
  const headers = corsHeaders(url.origin);

  if (request.method !== "GET") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: { ...headers, Allow: "GET, OPTIONS" } }
    );
  }

  if (requestOrigin(request) !== url.origin) {
    return Response.json(
      { error: "Origin not allowed" },
      { status: 403, headers }
    );
  }

  if (exceedsRateLimit(request)) {
    return Response.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { ...headers, "Retry-After": "60" } }
    );
  }

  const target = url.searchParams.get("url");

  if (target === null || target === "") {
    return Response.json(
      { error: "Missing 'url' query parameter" },
      { status: 400, headers }
    );
  }

  let destination: URL;

  try {
    destination = new URL(target);
  } catch {
    return Response.json(
      { error: "Invalid URL format" },
      { status: 400, headers }
    );
  }

  if (
    destination.protocol !== "https:" ||
    !destination.hostname.endsWith(".movember.com")
  ) {
    return Response.json(
      { error: "Only HTTPS Movember pages are allowed" },
      { status: 403, headers }
    );
  }

  if (
    destination.username !== "" ||
    destination.password !== "" ||
    destination.port !== ""
  ) {
    return Response.json(
      { error: "Credentials and custom ports are not allowed" },
      { status: 403, headers }
    );
  }

  try {
    const { html, finalUrl } = await fetchMovemberPage(
      destination.href,
      request.signal
    );

    return new Response(html, {
      headers: {
        ...headers,
        "content-type": "text/html; charset=UTF-8",
        "X-Final-URL": finalUrl,
      },
    });
  } catch (error) {
    console.error("Movember proxy request failed", error);

    const message =
      error instanceof Error ? error.message : "Movember request failed";

    return Response.json(
      {
        error: "Failed to fetch URL",
        message,
        upstreamStatus:
          error instanceof MovemberHttpError ? error.status : undefined,
      },
      { status: 502, headers }
    );
  }
};

export default {
  async fetch(request: Request, env: { ASSETS?: Fetcher }): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(url.origin),
      });
    }

    if (url.pathname === "/proxy") {
      return await proxy(request, url);
    }

    const routes = new Map([
      ["/", "/index.html"],
      ["/overlay", "/overlay.html"],
      ["/json", "/json.html"],
    ]);

    const destination = routes.get(url.pathname);

    if (destination !== undefined) {
      return new Response(null, {
        status: 302,
        headers: { Location: destination + url.search },
      });
    }

    if (env.ASSETS) {
      try {
        return await env.ASSETS.fetch(request);
      } catch (error) {
        console.error("Asset fetch failed", error);

        return new Response("Assets temporarily unavailable", { status: 503 });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};
