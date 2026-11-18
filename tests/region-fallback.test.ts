import { afterEach, describe, expect, it, vi } from "vitest";

import { getCachedSubdomain, setCachedSubdomain } from "../src/client/cache";
import { SUBDOMAIN_CACHE_TTL } from "../src/client/constants";
import { scrapeMovemberPage } from "../src/client/scraper/orchestrator";
import { detectSubdomainForMember } from "../src/client/scraper/subdomain";

const MEMBER_ID = "14810348";

const pageHtml = (country: string): string =>
  `<span class="donationProgress--amount__raised">$1,338</span><span class="donationProgress--amount__target">$10,000</span><p>${country}</p><!--${"x".repeat(1200)}-->`;

type ProxyFetch = (input: string, init?: RequestInit) => Promise<Response>;

const proxyTarget = (input: string): string =>
  new URL(input).searchParams.get("url") ?? "";

const unavailable = (status: number): Response =>
  Response.json(
    { message: `Movember returned HTTP ${status}`, upstreamStatus: status },
    { status: 502, headers: { "content-type": "application/json" } }
  );

const pageResponse = (target: string, html: string): Response =>
  new Response(html, { headers: { "X-Final-URL": target } });

const regionalNetwork = (region: string, html: string): ProxyFetch =>
  vi.fn<ProxyFetch>().mockImplementation(async (input) => {
    const target = proxyTarget(input);

    await Promise.resolve();

    return target.startsWith(`https://${region}.movember.com/`)
      ? unavailable(530)
      : pageResponse(target, html);
  });

describe("regional page recovery", () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("falls back to the member's own region when the configured page host has no origin", async () => {
    vi.stubGlobal("fetch", regionalNetwork("it", pageHtml("Australia")));

    const data = await scrapeMovemberPage(
      MEMBER_ID,
      true,
      undefined,
      `https://it.movember.com/mospace/${MEMBER_ID}`
    );

    expect(data.subdomain).toBe("au");
    expect(data.amount).toBe("$1,338");
    expect(getCachedSubdomain("member", MEMBER_ID)).toBe("au");
  });

  it("re-resolves a cached region whose origin is unavailable", async () => {
    setCachedSubdomain("member", MEMBER_ID, "it", SUBDOMAIN_CACHE_TTL);

    const network = regionalNetwork("it", pageHtml("Australia"));
    vi.stubGlobal("fetch", network);

    const data = await scrapeMovemberPage(MEMBER_ID, true);

    expect(data.subdomain).toBe("au");
    // The cached region fails, discovery probes the member's region, then it is fetched.
    expect(network).toHaveBeenCalledTimes(3);
  });

  it("keeps an access refusal fatal", async () => {
    const network = vi.fn<ProxyFetch>().mockResolvedValue(unavailable(403));

    vi.stubGlobal("fetch", network);

    await expect(
      scrapeMovemberPage(
        MEMBER_ID,
        true,
        undefined,
        `https://it.movember.com/mospace/${MEMBER_ID}`
      )
    ).rejects.toThrow("403");
    expect(network).toHaveBeenCalledOnce();
  });

  it("skips a region whose origin is unavailable during discovery", async () => {
    vi.stubGlobal("fetch", regionalNetwork("au", pageHtml("New Zealand")));

    await expect(detectSubdomainForMember("987654")).resolves.toBe("nz");
    expect(getCachedSubdomain("member", "987654")).toBe("nz");
  });
});
