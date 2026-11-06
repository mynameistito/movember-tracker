import { beforeEach, describe, expect, it } from "vitest";

import {
  clearSubdomainCache,
  getCachedData,
  getCachedSubdomain,
  setCachedData,
  setCachedSubdomain,
} from "../src/client/cache.ts";

describe("cache.js", () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  describe("getCachedData and setCachedData", () => {
    it("should store and retrieve cached data", () => {
      const memberId = "12345";

      const data = {
        amount: "$1,234.56",
        currency: "USD",
        subdomain: "us",
        timestamp: Date.now(),
      };

      const ttl = 300_000;

      setCachedData("member", memberId, data, ttl);
      const cached = getCachedData("member", memberId);

      expect(cached).toStrictEqual(data);
    });

    it("should return null for non-existent cache", () => {
      const cached = getCachedData("member", "nonexistent");
      expect(cached).toBeNull();
    });

    it("should return null for expired cache", () => {
      const memberId = "12345";

      const data = {
        amount: "$1,234.56",
        currency: "USD",
        subdomain: "us",
        timestamp: Date.now() - 600_000,
      };

      const ttl = 300_000;

      setCachedData("member", memberId, data, ttl);
      // Manually expire the cache by setting cachedAt to past
      const cacheKey = `movember:data:member:${memberId}`;

      const cacheValue = {
        data,
        cachedAt: Date.now() - 600_000,
        ttl,
      };

      localStorage.setItem(cacheKey, JSON.stringify(cacheValue));

      const cached = getCachedData("member", memberId);
      expect(cached).toBeNull();
    });

    it("should handle invalid JSON gracefully", () => {
      const memberId = "12345";
      const cacheKey = `movember:data:member:${memberId}`;
      localStorage.setItem(cacheKey, "invalid json");

      const cached = getCachedData("member", memberId);
      expect(cached).toBeNull();
    });
  });

  describe("getCachedSubdomain and setCachedSubdomain", () => {
    it("should store and retrieve cached subdomain", () => {
      const memberId = "12345";
      const subdomain = "uk";
      const ttl = 86_400_000;

      setCachedSubdomain("member", memberId, subdomain, ttl);
      const cached = getCachedSubdomain("member", memberId);

      expect(cached).toBe(subdomain);
    });

    it("should return null for non-existent subdomain cache", () => {
      const cached = getCachedSubdomain("member", "nonexistent");
      expect(cached).toBeNull();
    });

    it("should store subdomain independently of data cache", () => {
      const memberId = "12345";

      const data = {
        amount: "$1,234.56",
        currency: "USD",
        subdomain: "us",
        timestamp: Date.now(),
      };

      const dataTtl = 300_000;
      const subdomainTtl = 86_400_000;

      setCachedData("member", memberId, data, dataTtl);
      setCachedSubdomain("member", memberId, "uk", subdomainTtl);

      // Subdomain should be stored separately and retrievable
      const cachedSubdomain = getCachedSubdomain("member", memberId);
      expect(cachedSubdomain).toBe("uk");

      // Updating the routing cache preserves the snapshot country.
      const cachedData = getCachedData("member", memberId);
      expect(cachedData).toStrictEqual(data);
      expect(cachedData.subdomain).toBe("us");
    });

    it("should return null for expired subdomain cache", () => {
      const memberId = "12345";
      const subdomain = "uk";
      const ttl = 86_400_000;

      setCachedSubdomain("member", memberId, subdomain, ttl);
      // Manually expire the subdomain cache by setting cachedAt to past
      const subdomainKey = `movember:subdomain:member:${memberId}`;

      const cacheValue = {
        subdomain,
        cachedAt: Date.now() - 90_000_000,
        ttl,
      };

      localStorage.setItem(subdomainKey, JSON.stringify(cacheValue));

      const cached = getCachedSubdomain("member", memberId);
      expect(cached).toBeNull();
    });
  });

  describe(clearSubdomainCache, () => {
    it("should clear cached data for a member", () => {
      const memberId = "12345";

      const data = {
        amount: "$1,234.56",
        currency: "USD",
        subdomain: "us",
        timestamp: Date.now(),
      };

      const ttl = 300_000;

      setCachedData("member", memberId, data, ttl);
      clearSubdomainCache("member", memberId);

      const cached = getCachedData("member", memberId);
      expect(cached).toBeNull();
    });

    it("should clear subdomain cache", () => {
      const memberId = "12345";
      const subdomain = "uk";
      const ttl = 86_400_000;

      setCachedSubdomain("member", memberId, subdomain, ttl);
      clearSubdomainCache("member", memberId);

      const cached = getCachedSubdomain("member", memberId);
      expect(cached).toBeNull();
    });

    it("should handle clearing non-existent cache gracefully", () => {
      expect(() => {
        clearSubdomainCache("member", "nonexistent");
      }).not.toThrow();
    });
  });
});
