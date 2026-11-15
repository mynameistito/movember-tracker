import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getCachedData,
  setCachedData,
  setCachedSubdomain,
} from "../src/client/cache";
import { getRecentErrors } from "../src/client/error-tracking";
import {
  getData,
  getTeamData,
  scrapeTeamPage,
} from "../src/client/scraper/orchestrator";

describe("cached donation reads", () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("omits raw team IDs from persisted markup failures", async () => {
    const id = "987654321";
    setCachedSubdomain("team", id, "nz", 86_400_000);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response("<html><body>No totals</body></html>", {
          headers: { "X-Final-URL": `https://nz.movember.com/team/${id}` },
        })
      )
    );
    await expect(scrapeTeamPage(id)).rejects.toThrow(
      "Could not find raised amount"
    );
    const errors = getRecentErrors();
    expect(errors).toHaveLength(1);
    expect(errors[0].category).toBe("scraping");
    expect(JSON.stringify(errors)).not.toContain(id);
  });

  it.each(["member", "team"] as const)(
    "returns a stale %s snapshot while refreshing it",
    async (type) => {
      const data = {
        amount: "$400",
        currency: "NZD",
        subdomain: "nz",
        timestamp: Date.now(),
      };

      setCachedData(type, "stale123", data, 0);
      setCachedSubdomain(type, "stale123", "nz", 86_400_000);
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>().mockResolvedValue(
          new Response(
            '<div class="donationProgress--amount__raised">$500</div>',
            {
              headers: {
                "X-Final-URL": "https://nz.movember.com/team/stale123",
              },
            }
          )
        )
      );

      const result =
        type === "member"
          ? await getData("stale123")
          : await getTeamData("stale123");

      expect(result).toStrictEqual({ data, cacheStatus: "STALE" });
      await vi.waitFor(() => {
        expect(getCachedData(type, "stale123")?.amount).toBe("$500");
      });
    }
  );

  it.each(["member", "team"] as const)(
    "reads a fresh %s snapshot without fetching",
    async (type) => {
      const data = {
        amount: "$400",
        currency: "NZD",
        subdomain: "nz",
        timestamp: Date.now(),
      };

      setCachedData(type, "123", data, 300_000);
      const network = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", network);

      const result =
        type === "member" ? await getData("123") : await getTeamData("123");

      expect(result).toStrictEqual({ data, cacheStatus: "HIT" });
      expect(network).not.toHaveBeenCalled();
    }
  );
});
