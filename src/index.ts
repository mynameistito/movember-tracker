// Simple static file server for client-side application

// Rate limiting: Simple in-memory store (resets on worker restart)
// In production, consider using Cloudflare KV or Durable Objects for persistence
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// Rate limit configuration
const RATE_LIMIT = {
	maxRequests: 100, // Max requests per window
	windowMs: 60 * 1000, // 1 minute window
};

/**
 * Check if request exceeds rate limit
 * @param request - The incoming request
 * @returns true if rate limit exceeded, false otherwise
 */
function checkRateLimit(request: Request): boolean {
	// Get client identifier (IP address)
	const clientId =
		request.headers.get("CF-Connecting-IP") ||
		request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
		"unknown";

	const now = Date.now();
	const record = rateLimitStore.get(clientId);

	// Clean up expired entries periodically (every 100 requests)
	if (rateLimitStore.size > 1000) {
		for (const [key, value] of rateLimitStore.entries()) {
			if (value.resetAt < now) {
				rateLimitStore.delete(key);
			}
		}
	}

	if (!record || record.resetAt < now) {
		// New window or expired window
		rateLimitStore.set(clientId, {
			count: 1,
			resetAt: now + RATE_LIMIT.windowMs,
		});
		return false;
	}

	// Increment count
	record.count++;

	if (record.count > RATE_LIMIT.maxRequests) {
		return true; // Rate limit exceeded
	}

	return false;
}

/**
 * Get CORS headers with validated origin
 * @param request - The incoming request
 * @param workerOrigin - The worker's origin
 * @returns CORS headers object
 */
function getCorsHeaders(
	request: Request,
	workerOrigin: string,
): Record<string, string> {
	const requestOrigin = request.headers.get("Origin");
	const referer = request.headers.get("Referer");

	let originToUse: string | null = requestOrigin;
	if (!originToUse && referer) {
		try {
			originToUse = new URL(referer).origin;
		} catch {
			// Invalid Referer URL
		}
	}

	// Validate origin matches worker origin
	if (originToUse && originToUse.toLowerCase() === workerOrigin.toLowerCase()) {
		return {
			"Access-Control-Allow-Origin": originToUse,
			"Access-Control-Allow-Methods": "GET, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
			"Access-Control-Max-Age": "86400",
		};
	}

	// Fallback: return worker origin (safer than "*")
	return {
		"Access-Control-Allow-Origin": workerOrigin,
		"Access-Control-Allow-Methods": "GET, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
		"Access-Control-Max-Age": "86400",
	};
}

export default {
	async fetch(request: Request, env: { ASSETS?: Fetcher }): Promise<Response> {
		const url = new URL(request.url);
		const pathname = url.pathname;
		const method = request.method;
		const workerOrigin = url.origin;

		console.log(`[REQUEST] ${method} ${pathname} from ${url.origin}`);

		try {
			// CORS proxy endpoint for fetching Movember pages
			if (pathname === "/proxy") {
				// Check rate limit
				if (checkRateLimit(request)) {
					const corsHeaders = getCorsHeaders(request, workerOrigin);
					return new Response(
						JSON.stringify({
							error: "Rate limit exceeded",
							message: `Maximum ${RATE_LIMIT.maxRequests} requests per ${RATE_LIMIT.windowMs / 1000} seconds`,
						}),
						{
							status: 429,
							headers: {
								"content-type": "application/json",
								...corsHeaders,
								"Retry-After": String(Math.ceil(RATE_LIMIT.windowMs / 1000)),
							},
						},
					);
				}

				const targetUrl = url.searchParams.get("url");

				if (!targetUrl) {
					const corsHeaders = getCorsHeaders(request, workerOrigin);
					return new Response(
						JSON.stringify({ error: "Missing 'url' query parameter" }),
						{
							status: 400,
							headers: {
								"content-type": "application/json",
								...corsHeaders,
							},
						},
					);
				}

				// Origin validation: Only allow requests from the same Worker domain
				const requestOrigin = request.headers.get("Origin");
				const referer = request.headers.get("Referer");

				let requestOriginToCheck = requestOrigin;
				if (!requestOriginToCheck && referer) {
					try {
						requestOriginToCheck = new URL(referer).origin;
					} catch {
						// Invalid Referer URL, will fail origin check
					}
				}

				if (
					!requestOriginToCheck ||
					requestOriginToCheck.toLowerCase() !== workerOrigin.toLowerCase()
				) {
					const corsHeaders = getCorsHeaders(request, workerOrigin);
					return new Response(JSON.stringify({ error: "Origin not allowed" }), {
						status: 403,
						headers: {
							"content-type": "application/json",
							...corsHeaders,
						},
					});
				}

				// Domain validation: Only allow *.movember.com domains
				let targetUrlObj: URL;
				const corsHeaders = getCorsHeaders(request, workerOrigin);
				try {
					targetUrlObj = new URL(targetUrl);
				} catch {
					return new Response(JSON.stringify({ error: "Invalid URL format" }), {
						status: 400,
						headers: {
							"content-type": "application/json",
							...corsHeaders,
						},
					});
				}

				const targetHostname = targetUrlObj.hostname.toLowerCase();
				if (!targetHostname.endsWith(".movember.com")) {
					return new Response(
						JSON.stringify({
							error: "Only *.movember.com domains are allowed",
						}),
						{
							status: 403,
							headers: {
								"content-type": "application/json",
								...corsHeaders,
							},
						},
					);
				}

				try {
					console.log(`[PROXY] Fetching: ${targetUrl}`);
					const response = await fetch(targetUrl, {
						headers: {
							"User-Agent":
								"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
							Accept:
								"text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
							"Accept-Language": "en-US,en;q=0.9",
						},
						redirect: "follow", // Explicitly follow redirects
					});

					if (!response.ok) {
						throw new Error(`HTTP error! status: ${response.status}`);
					}

					const html = await response.text();
					// Get the final URL after redirects
					const finalUrl = response.url;

					return new Response(html, {
						status: 200,
						headers: {
							"content-type": "text/html; charset=UTF-8",
							...corsHeaders,
							"X-Final-URL": finalUrl, // Include final URL in response header
						},
					});
				} catch (error) {
					const errorMessage =
						error instanceof Error ? error.message : String(error);
					console.error(`[PROXY] Error fetching ${targetUrl}:`, errorMessage);

					const corsHeaders = getCorsHeaders(request, workerOrigin);
					return new Response(
						JSON.stringify({
							error: "Failed to fetch URL",
							message: errorMessage,
						}),
						{
							status: 500,
							headers: {
								"content-type": "application/json",
								...corsHeaders,
							},
						},
					);
				}
			}

			// Handle OPTIONS requests for CORS preflight
			if (method === "OPTIONS") {
				const corsHeaders = getCorsHeaders(request, workerOrigin);
				return new Response(null, {
					status: 204,
					headers: corsHeaders,
				});
			}

			// Route handling - redirect to HTML files
			if (pathname === "/json") {
				// Redirect to JSON endpoint HTML page
				return new Response(null, {
					status: 302,
					headers: {
						Location: `/json.html${url.search ? url.search : ""}`,
					},
				});
			} else if (pathname === "/overlay") {
				// Redirect to overlay HTML page
				return new Response(null, {
					status: 302,
					headers: {
						Location: `/overlay.html${url.search ? url.search : ""}`,
					},
				});
			} else if (pathname === "/") {
				// Redirect to main index page
				return new Response(null, {
					status: 302,
					headers: {
						Location: `/index.html${url.search ? url.search : ""}`,
					},
				});
			}

			// Try to serve static assets via Workers Assets
			if (env.ASSETS) {
				try {
					const response = await env.ASSETS.fetch(request);
					if (response.status !== 404) {
						return response;
					}
				} catch (error) {
					console.warn(`[ASSETS] Failed to serve asset: ${pathname}`, error);
				}
			}

			// Fallback: 404 for other paths
			console.warn(`[RESPONSE] 404 Not Found for path: ${pathname}`);

			return new Response("Not Found", {
				status: 404,
				headers: {
					"content-type": "text/plain",
				},
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);

			console.error(`[ERROR] Request failed:`, {
				pathname,
				error: errorMessage,
			});

			return new Response(
				JSON.stringify(
					{
						error: "Internal server error",
						message: errorMessage,
						timestamp: Date.now(),
					},
					null,
					2,
				),
				{
					status: 500,
					headers: {
						"content-type": "application/json",
					},
				},
			);
		}
	},
};
