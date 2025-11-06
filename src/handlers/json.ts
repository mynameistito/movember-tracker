import type { Env } from '../types';
import { getData } from './data';

export async function handleJson(request: Request, env: Env, requestStartTime: number): Promise<Response> {
  const { data, cacheStatus } = await getData(env, request);

  const duration = Date.now() - requestStartTime;
  console.log(`[RESPONSE] JSON response sent in ${duration}ms`, {
    cache: cacheStatus,
    amount: data.amount,
  });
  
  // Return JSON response
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json",
      "x-cache": cacheStatus,
    },
  });
}

