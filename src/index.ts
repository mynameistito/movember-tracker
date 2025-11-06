// Simple static file server for client-side application
export default {
  async fetch(request: Request, env: { ASSETS?: Fetcher }): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    console.log(`[REQUEST] ${method} ${pathname} from ${url.origin}`);

    try {
      // CORS proxy endpoint for fetching Movember pages
      if (pathname === "/proxy") {
        const targetUrl = url.searchParams.get("url");
        
        if (!targetUrl) {
          return new Response(
            JSON.stringify({ error: "Missing 'url' query parameter" }),
            {
              status: 400,
              headers: {
                "content-type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            }
          );
        }

        try {
          console.log(`[PROXY] Fetching: ${targetUrl}`);
          const response = await fetch(targetUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
            },
            redirect: 'follow', // Explicitly follow redirects
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
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type",
              "X-Final-URL": finalUrl, // Include final URL in response header
            },
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`[PROXY] Error fetching ${targetUrl}:`, errorMessage);
          
          return new Response(
            JSON.stringify({
              error: "Failed to fetch URL",
              message: errorMessage,
            }),
            {
              status: 500,
              headers: {
                "content-type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            }
          );
        }
      }

      // Handle OPTIONS requests for CORS preflight
      if (method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "86400",
          },
        });
      }

      // Route handling - redirect to HTML files
      if (pathname === "/json") {
        // Redirect to JSON endpoint HTML page
        return new Response(null, {
          status: 302,
          headers: {
            "Location": "/json.html" + (url.search ? url.search : ""),
          },
        });
      } else if (pathname === "/overlay") {
        // Redirect to overlay HTML page
        return new Response(null, {
          status: 302,
          headers: {
            "Location": "/overlay.html" + (url.search ? url.search : ""),
          },
        });
      } else if (pathname === "/") {
        // Redirect to main index page
        return new Response(null, {
          status: 302,
          headers: {
            "Location": "/index.html" + (url.search ? url.search : ""),
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      
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
          2
        ),
        {
          status: 500,
          headers: {
            "content-type": "application/json",
          },
        }
      );
    }
  },
};
