import { afterEach, describe, expect, it, vi } from "vitest";

import { getCachedSubdomain } from "../src/client/cache";
import {
  detectSubdomainFromHtml,
  detectSubdomainForMember,
} from "../src/client/scraper/subdomain";

describe("country inference", () => {
  it.each([
    ["£100", "uk"],
    ["&pound;100", "uk"],
    ["€100 Germany", "de"],
    ["EUR 100 Netherlands", "nl"],
    ["€100", "ie"],
    ["NZD 500", "nz"],
    ["$500 New Zealand", "nz"],
    ["$500 Canada", "ca"],
    ["$500", "au"],
    ["No donation currency here", null],
    [null, null],
  ])("infers %s as %s", (html, expected) => {
    expect(detectSubdomainFromHtml(html)).toBe(expected);
  });
});

describe("country discovery", () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("stops discovery after an upstream access refusal", async () => {
    const network = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          message: "Movember returned HTTP 403",
          upstreamStatus: 403,
        },
        { status: 502, headers: { "content-type": "application/json" } }
      )
    );

    vi.stubGlobal("fetch", network);
    await expect(detectSubdomainForMember("403123")).rejects.toThrow("403");
    expect(network).toHaveBeenCalledOnce();
    expect(getCachedSubdomain("member", "403123")).toBeNull();
  });

  it("does not cache a default country when all probes fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockRejectedValue(new Error("Offline"))
    );
    await expect(detectSubdomainForMember("987654")).resolves.toBe("au");
    expect(getCachedSubdomain("member", "987654")).toBeNull();
  });

  it("caches redirect evidence before currency inference", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response("£100", {
          headers: {
            "X-Final-URL":
              "https://nz.movember.com/donate/details?memberId=987654",
          },
        })
      )
    );
    await expect(detectSubdomainForMember("987654")).resolves.toBe("nz");
    expect(getCachedSubdomain("member", "987654")).toBe("nz");
  });
});
