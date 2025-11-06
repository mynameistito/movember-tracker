import type { Env } from './types';
import { handleJson } from './handlers/json';
import { handleOverlay } from './handlers/overlay';
import { handleDocs } from './handlers/docs';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestStartTime = Date.now();
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    console.log(`[REQUEST] ${method} ${pathname} from ${url.origin}`);

    try {
      // Route handling
      if (pathname === "/json") {
        return await handleJson(request, env, requestStartTime);
      } else if (pathname === "/overlay") {
        return await handleOverlay(request, env, requestStartTime);
      } else if (pathname === "/") {
        return await handleDocs(request, env, requestStartTime);
      } else {
        // 404 for other paths
        const duration = Date.now() - requestStartTime;
        console.warn(`[RESPONSE] 404 Not Found for path: ${pathname} (${duration}ms)`);
        
        return new Response("Not Found", {
          status: 404,
          headers: {
            "content-type": "text/plain",
          },
        });
      }
    } catch (error) {
      const duration = Date.now() - requestStartTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      console.error(`[ERROR] Request failed after ${duration}ms:`, {
        pathname,
        error: errorMessage,
        stack: errorStack,
      });
      
      // Return error in appropriate format based on route
      if (pathname === "/json") {
        return new Response(
          JSON.stringify(
            {
              error: "Failed to scrape Movember page",
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
      } else {
        // HTML error page for root path
        const errorHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: transparent;
      color: #fff;
    }
    .error {
      font-size: 24px;
      font-weight: 500;
      color: #ff4444;
    }
  </style>
</head>
<body>
  <div class="error">Error loading donation amount</div>
</body>
</html>`;
        
        console.error(`[ERROR] Returning HTML error page`);
        
        return new Response(errorHtml, {
          status: 500,
          headers: {
            "content-type": "text/html; charset=UTF-8",
          },
        });
      }
    }
  },
} satisfies ExportedHandler<Env>;
