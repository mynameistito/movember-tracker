import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const donationPage = (amount: number): string =>
  `<div class="donationProgress--amount__raised">$${amount}</div><div class="donationProgress--amount__target">$200</div>`;

describe("stream overlay", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    localStorage.clear();
    history.replaceState({}, "", "/overlay?memberId=123&interval=30");
    document.body.replaceChildren();
    const container = document.createElement("section");
    container.id = "overlayContainer";

    for (const id of ["amount", "target", "progressBar", "status"]) {
      const element = document.createElement("div");
      element.id = id;
      container.append(element);
    }

    const track = document.createElement("div");
    track.className = "track";
    container.append(track);
    document.body.append(container);
  });

  afterEach(() => {
    window.dispatchEvent(new Event("pagehide"));
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retains totals through a failed refresh and recovers on a later poll", async () => {
    let offline = false;
    let amount = 100;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async () => {
        if (offline) {
          throw new Error("Offline");
        }

        return await Promise.resolve(
          new Response(donationPage(amount), {
            headers: {
              "X-Final-URL":
                "https://nz.movember.com/donate/details?memberId=123",
            },
          })
        );
      })
    );
    await import("../src/client/overlay");
    await vi.waitFor(() => {
      expect(document.querySelector("#amount")?.textContent).toBe("$100");
    });
    offline = true;
    await vi.advanceTimersByTimeAsync(35_000);
    expect(document.querySelector("#amount")?.textContent).toBe("$100");
    expect(document.querySelector("#status")?.textContent).toContain(
      "retrying"
    );
    offline = false;
    amount = 150;
    await vi.advanceTimersByTimeAsync(35_000);
    await vi.waitFor(() => {
      expect(document.querySelector("#amount")?.textContent).toBe("$150");
    });
  });

  it("tracks a team and applies its selected position", async () => {
    history.replaceState(
      {},
      "",
      "/overlay?teamId=123&interval=1&location=topleft"
    );

    const network = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        await Promise.resolve(
          new Response(donationPage(100), {
            headers: { "X-Final-URL": "https://nz.movember.com/team/123" },
          })
        )
    );

    vi.stubGlobal("fetch", network);
    await import("../src/client/overlay");
    await vi.waitFor(() => {
      expect(document.querySelector("#amount")?.textContent).toBe("$100");
    });
    expect(
      document.querySelector<HTMLElement>("#overlayContainer")?.dataset.position
    ).toBe("topleft");
    expect(network.mock.calls.at(-1)?.[0]).toContain("team%2F123");
  });

  it("rejects invalid IDs before fetching", async () => {
    history.replaceState({}, "", "/overlay?memberId=invalid");
    const network = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", network);
    await import("../src/client/overlay");
    expect(network).not.toHaveBeenCalled();
    expect(document.querySelector("#amount")?.textContent).toBe(
      "Invalid Movember ID"
    );
  });
});
