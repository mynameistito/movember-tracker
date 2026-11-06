import { QueryClient, QueryObserver } from "@tanstack/query-core";
import { Effect } from "effect";

import { getStaleCachedData } from "./cache.js";
import type { CachedData } from "./cache.js";
import { Tracking, TrackingError, trackingLayer } from "./tracking.js";
import type { TrackingInput } from "./tracking.js";

/**
 * Subscribe to donation snapshots.
 * @param input - Member or team to track.
 * @param interval - Polling interval in milliseconds.
 * @param listener - Receives the last successful snapshot and refresh failure state.
 * @returns Disposal function that stops polling and releases the cache.
 */
export const observeTracking = (
  input: TrackingInput,
  interval: number,
  listener: (data: CachedData | undefined, failed: boolean) => void
): (() => void) => {
  const client = new QueryClient();
  client.mount();

  const observer = new QueryObserver(client, {
    queryKey: ["donations", input.type, input.id],
    queryFn: async ({ signal }) =>
      await Effect.runPromise(
        Effect.gen(function* queryFn() {
          const tracking = yield* Tracking;

          return yield* tracking.refresh(input);
        }).pipe(Effect.provide(trackingLayer)),
        { signal }
      ),
    initialData: getStaleCachedData(input.type, input.id) ?? undefined,
    initialDataUpdatedAt: 0,
    staleTime: interval,
    refetchInterval: interval,
    refetchIntervalInBackground: true,
    retry: (failures, error) =>
      failures < 2 && error instanceof TrackingError && error.retryable,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
  });

  let notified = false;

  const unsubscribe = observer.subscribe((result) => {
    notified = true;
    listener(result.data, result.isError);
  });

  if (!notified) {
    const current = observer.getCurrentResult();
    listener(current.data, current.isError);
  }

  return () => {
    unsubscribe();
    observer.destroy();
    client.unmount();
    client.clear();
  };
};
