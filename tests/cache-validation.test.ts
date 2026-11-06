import { beforeEach, describe, expect, it } from "vitest";

import {
  getCachedData,
  getStaleCachedData,
  setCachedData,
} from "../src/client/cache";

describe("persisted donation validation", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it.each([
    null,
    [],
    { data: { amount: 42 }, cachedAt: 0, ttl: 300_000 },
    { data: {}, cachedAt: "today", ttl: -1 },
  ])("rejects malformed persisted input %j", (entry) => {
    localStorage.setItem("movember:data:member:123", JSON.stringify(entry));
    expect(getCachedData("member", "123")).toBeNull();
    expect(getStaleCachedData("member", "123")).toBeNull();
  });

  it("keeps member and team totals isolated", () => {
    const member = {
      amount: "$20",
      currency: "NZD",
      subdomain: "nz",
      timestamp: Date.now(),
    };

    const team = { ...member, amount: "$100" };
    setCachedData("member", "123", member, 300_000);
    setCachedData("team", "123", team, 300_000);
    expect(getCachedData("member", "123")).toStrictEqual(member);
    expect(getCachedData("team", "123")).toStrictEqual(team);
  });
});
