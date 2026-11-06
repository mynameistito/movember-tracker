// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "../src/index";
import { fetchMovemberPage } from "../src/movember-proxy";

describe("Movember proxy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes caller cancellation to the upstream request", async () => {
    const caller = new AbortController();
    let upstream: AbortSignal | null | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
        upstream = options?.signal;

        return await Promise.resolve(new Response("page"));
      })
    );
    await fetchMovemberPage("https://nz.movember.com/team/123", caller.signal);
    caller.abort();
    expect(upstream?.aborted).toBeTruthy();
  });

  it("bounds redirect chains to five followed redirects", async () => {
    const fetchPage = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { Location: "/team/123" } })
      );

    vi.stubGlobal("fetch", fetchPage);
    await expect(
      fetchMovemberPage("https://nz.movember.com/team/123")
    ).rejects.toThrow("redirected too many times");
    expect(fetchPage).toHaveBeenCalledTimes(6);
  });

  it("rejects redirects without a destination", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 302 }))
    );
    await expect(
      fetchMovemberPage("https://nz.movember.com/team/123")
    ).rejects.toThrow("no destination");
  });

  it.each([
    ["/overlay?teamId=123", "/overlay.html?teamId=123"],
    ["/?memberId=456", "/index.html?memberId=456"],
    ["/json?memberId=456", "/json.html?memberId=456"],
  ])("preserves configuration when routing %s", async (path, destination) => {
    const response = await worker.fetch(
      new Request(`https://tracker.example${path}`),
      {}
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(destination);
  });

  it.each([
    ["https://example.com/private", 403],
    ["http://au.movember.com/team/123", 403],
    ["https://user:pass@au.movember.com/team/123", 403],
    ["invalid", 400],
  ])("rejects unsupported proxy target %s", async (target, status) => {
    const fetch = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetch);
    const url = new URL("https://tracker.example/proxy");
    url.searchParams.set("url", target);

    const response = await worker.fetch(
      new Request(url, { headers: { Origin: url.origin } }),
      {}
    );

    expect(response.status).toBe(status);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects cross-origin proxy requests", async () => {
    const response = await worker.fetch(
      new Request(
        "https://tracker.example/proxy?url=https://au.movember.com/team/123",
        { headers: { Origin: "https://other.example" } }
      ),
      {}
    );

    expect(response.status).toBe(403);
  });

  it("reports an upstream failure as a gateway error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockRejectedValue(new Error("Upstream unavailable"))
    );

    const response = await worker.fetch(
      new Request(
        "https://tracker.example/proxy?url=https://au.movember.com/team/123",
        { headers: { Origin: "https://tracker.example" } }
      ),
      {}
    );

    expect(response.status).toBe(502);
  });

  it("answers preflight before requiring a target URL", async () => {
    const response = await worker.fetch(
      new Request("https://tracker.example/proxy", { method: "OPTIONS" }),
      {}
    );

    expect(response.status).toBe(204);
  });

  it("rejects an external redirect before fetching its destination", async () => {
    const fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "https://example.com/private" },
      })
    );

    vi.stubGlobal("fetch", fetch);
    await expect(
      fetchMovemberPage("https://au.movember.com/team/123")
    ).rejects.toThrow("Only HTTPS Movember");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("follows a relative redirect and reports the validated final URL", async () => {
    const fetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { Location: "/team/456" } })
      )
      .mockResolvedValueOnce(new Response("donations"));

    vi.stubGlobal("fetch", fetch);
    await expect(
      fetchMovemberPage("https://nz.movember.com/team/123")
    ).resolves.toStrictEqual({
      html: "donations",
      finalUrl: "https://nz.movember.com/team/456",
    });
  });

  it("rejects non-HTTPS targets without fetching", async () => {
    const fetch = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetch);
    await expect(
      fetchMovemberPage("http://au.movember.com/team/123")
    ).rejects.toThrow("Only HTTPS Movember");
    expect(fetch).not.toHaveBeenCalled();
  });
});
