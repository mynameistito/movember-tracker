import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getCachedData } from "../src/client/cache";
import type { CachedData } from "../src/client/cache";
import { getRecentErrors } from "../src/client/error-tracking";
import { observeTracking } from "../src/client/tracking-query";

const html =
  '<div class="donationProgress--amount__raised">$1,250</div><div class="donationProgress--amount__target">$2,000</div><p>NZD New Zealand</p>';

describe("tracking query", () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("reports terminal access failures without retrying the request", async () => {
    const network = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { message: "Forbidden", upstreamStatus: 403 },
          { status: 502 }
        )
      );

    vi.stubGlobal("fetch", network);

    const listener =
      vi.fn<(data: CachedData | undefined, failed: boolean) => void>();

    const dispose = observeTracking(
      { type: "member", id: "403456" },
      300_000,
      listener
    );

    try {
      expect(listener).toHaveBeenCalledOnce();
      await vi.waitFor(() => {
        expect(listener).toHaveBeenLastCalledWith(undefined, true);
      });
      expect(network).toHaveBeenCalledOnce();
    } finally {
      dispose();
    }
  });

  it("retries a transient network failure and publishes the recovered snapshot", async () => {
    const network = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockImplementation(
        async () =>
          await Promise.resolve(
            new Response(html, {
              headers: { "X-Final-URL": "https://nz.movember.com/team/456" },
            })
          )
      );

    vi.stubGlobal("fetch", network);

    const listener =
      vi.fn<(data: CachedData | undefined, failed: boolean) => void>();

    const dispose = observeTracking(
      { type: "team", id: "456" },
      300_000,
      listener
    );

    try {
      await vi.waitFor(
        () => {
          expect(getCachedData("team", "456")?.amount).toBe("$1,250");
        },
        { timeout: 3000 }
      );
      expect(network).toHaveBeenCalledTimes(3);
    } finally {
      dispose();
    }
  });

  it("aborts a pending scrape when its observer is disposed", async () => {
    let requestSignal: AbortSignal | null | undefined;

    const network = vi
      .fn<typeof fetch>()
      .mockImplementation(async (_url, options) => {
        requestSignal = options?.signal;

        return await Effect.runPromise(Effect.never, {
          signal: requestSignal ?? undefined,
        });
      });

    vi.stubGlobal("fetch", network);

    const dispose = observeTracking(
      { type: "member", id: "cancel123" },
      300_000,
      () => {}
    );

    try {
      await vi.waitFor(() => {
        expect(requestSignal).toBeDefined();
      });
      dispose();
      await vi.waitFor(() => {
        expect(requestSignal?.aborted).toBeTruthy();
      });
      expect(network).toHaveBeenCalledOnce();
      expect(getRecentErrors()).toStrictEqual([]);
      expect(getCachedData("member", "cancel123")).toBeNull();
    } finally {
      dispose();
    }
  });

  it.each(["member", "team"] as const)(
    "fetches, parses, publishes and persists a fresh %s snapshot",
    async (type) => {
      const fetchPage = vi.fn<typeof fetch>().mockImplementation(
        async () =>
          await Promise.resolve(
            new Response(html, {
              headers: { "X-Final-URL": "https://nz.movember.com/team/123" },
            })
          )
      );

      vi.stubGlobal("fetch", fetchPage);
      let received: CachedData | undefined;

      const dispose = observeTracking({ type, id: "123" }, 300_000, (data) => {
        received = data;
      });

      try {
        await vi.waitFor(() => {
          expect(received).toBeDefined();
        });
        expect(received).toStrictEqual(
          expect.objectContaining({
            amount: "$1,250",
            currency: "NZD",
            subdomain: "nz",
            target: "$2,000",
            percentage: 63,
          })
        );
        expect(getCachedData(type, "123")).toStrictEqual(received);
        const [[url, options]] = fetchPage.mock.calls;

        expect(url).toContain("/proxy?url=");
        expect(options?.signal).toBeInstanceOf(AbortSignal);
      } finally {
        dispose();
      }
    }
  );
});
