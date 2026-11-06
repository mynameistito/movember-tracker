import { Context, Effect, Layer, Schema } from "effect";

import { setCachedData } from "./cache.js";
import { CACHE_TTL } from "./constants.js";
import { scrapeMovemberPage, scrapeTeamPage } from "./scraper/orchestrator.js";
import type { ScrapedData } from "./scraper/orchestrator.js";

/** A member or team whose donation progress is being tracked. */
export interface TrackingInput {
  readonly type: "member" | "team";
  readonly id: string;
}

/** A scrape failed; callers may retain the last successful snapshot. */
export class TrackingError extends Schema.TaggedError<TrackingError>()(
  "TrackingError",
  {
    message: Schema.String,
  }
) {}

/** Owns fresh donation acquisition and persistence of successful snapshots. */
export class Tracking extends Context.Service<
  Tracking,
  {
    readonly refresh: (
      input: TrackingInput
    ) => Effect.Effect<ScrapedData, TrackingError>;
  }
>()("movember/Tracking") {}

/** Browser implementation; Query owns scheduling and bounded retries. */
export const trackingLayer = Layer.sync(Tracking, () => {
  const refresh = Effect.fn("Tracking.refresh")(function* refresh(
    input: TrackingInput
  ) {
    const data = yield* Effect.tryPromise({
      try: async (signal) =>
        input.type === "team"
          ? await scrapeTeamPage(input.id, true, signal)
          : await scrapeMovemberPage(input.id, true, signal),
      catch: (cause) =>
        new TrackingError({
          message:
            cause instanceof Error ? cause.message : "Donation refresh failed",
        }),
    });

    setCachedData(input.type, input.id, data, CACHE_TTL);

    return data;
  });

  return Tracking.of({ refresh });
});
