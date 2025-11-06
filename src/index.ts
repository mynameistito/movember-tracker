// Simple static file server for client-side application
export default {
  async fetch(request: Request, env: { ASSETS?: Fetcher }): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    console.log(`[REQUEST] ${method} ${pathname} from ${url.origin}`);

    try {
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
