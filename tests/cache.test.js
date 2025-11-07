import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	clearSubdomainCache,
	getCachedData,
	getCachedSubdomain,
	setCachedData,
	setCachedSubdomain,
} from "../public/js/cache.js";

// Mock localStorage
const localStorageMock = (() => {
	let store = {};

	return {
		getItem: (key) => store[key] || null,
		setItem: (key, value) => {
			store[key] = value.toString();
		},
		removeItem: (key) => {
			delete store[key];
		},
		clear: () => {
			store = {};
		},
	};
})();

// Mock logger to avoid console output during tests
vi.mock("../public/js/logger.js", () => ({
	default: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

describe("cache.js", () => {
	beforeEach(() => {
		// Clear localStorage before each test
		localStorageMock.clear();
		// Replace global localStorage with mock
		global.localStorage = localStorageMock;
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
			const ttl = 300000; // 5 minutes

			setCachedData(memberId, data, ttl);
			const cached = getCachedData(memberId);

			expect(cached).toEqual(data);
		});

		it("should return null for non-existent cache", () => {
			const cached = getCachedData("nonexistent");
			expect(cached).toBeNull();
		});

		it("should return null for expired cache", () => {
			const memberId = "12345";
			const data = {
				amount: "$1,234.56",
				currency: "USD",
				subdomain: "us",
				timestamp: Date.now() - 600000, // 10 minutes ago
			};
			const ttl = 300000; // 5 minutes

			setCachedData(memberId, data, ttl);
			// Manually expire the cache by setting cachedAt to past
			const cacheKey = `movember:data:${memberId}`;
			const cacheValue = {
				data,
				cachedAt: Date.now() - 600000, // 10 minutes ago
				ttl,
			};
			localStorageMock.setItem(cacheKey, JSON.stringify(cacheValue));

			const cached = getCachedData(memberId);
			expect(cached).toBeNull();
		});

		it("should handle invalid JSON gracefully", () => {
			const memberId = "12345";
			const cacheKey = `movember:data:${memberId}`;
			localStorageMock.setItem(cacheKey, "invalid json");

			const cached = getCachedData(memberId);
			expect(cached).toBeNull();
		});
	});

	describe("getCachedSubdomain and setCachedSubdomain", () => {
		it("should store and retrieve cached subdomain", () => {
			const memberId = "12345";
			const subdomain = "uk";
			const ttl = 86400000; // 24 hours

			setCachedSubdomain(memberId, subdomain, ttl);
			const cached = getCachedSubdomain(memberId);

			expect(cached).toBe(subdomain);
		});

		it("should return null for non-existent subdomain cache", () => {
			const cached = getCachedSubdomain("nonexistent");
			expect(cached).toBeNull();
		});

		it("should update subdomain in existing cache", () => {
			const memberId = "12345";
			const data = {
				amount: "$1,234.56",
				currency: "USD",
				subdomain: "us",
				timestamp: Date.now(),
			};
			const ttl = 300000;

			setCachedData(memberId, data, ttl);
			setCachedSubdomain(memberId, "uk", ttl);

			const cached = getCachedData(memberId);
			expect(cached.subdomain).toBe("uk");
		});

		it("should return null for expired subdomain cache", () => {
			const memberId = "12345";
			const data = {
				amount: "$1,234.56",
				currency: "USD",
				subdomain: "us",
				timestamp: Date.now(),
			};
			const ttl = 300000;

			setCachedData(memberId, data, ttl);
			// Manually expire the cache by setting cachedAt to past (beyond SUBDOMAIN_CACHE_TTL)
			const cacheKey = `movember:data:${memberId}`;
			const cacheValue = {
				data,
				cachedAt: Date.now() - 90000000, // 25 hours ago
				ttl,
			};
			localStorageMock.setItem(cacheKey, JSON.stringify(cacheValue));

			const cached = getCachedSubdomain(memberId);
			expect(cached).toBeNull();
		});
	});

	describe("clearSubdomainCache", () => {
		it("should clear cached data for a member", () => {
			const memberId = "12345";
			const data = {
				amount: "$1,234.56",
				currency: "USD",
				subdomain: "us",
				timestamp: Date.now(),
			};
			const ttl = 300000;

			setCachedData(memberId, data, ttl);
			clearSubdomainCache(memberId);

			const cached = getCachedData(memberId);
			expect(cached).toBeNull();
		});

		it("should clear subdomain cache", () => {
			const memberId = "12345";
			const subdomain = "uk";
			const ttl = 86400000;

			setCachedSubdomain(memberId, subdomain, ttl);
			clearSubdomainCache(memberId);

			const cached = getCachedSubdomain(memberId);
			expect(cached).toBeNull();
		});

		it("should handle clearing non-existent cache gracefully", () => {
			expect(() => {
				clearSubdomainCache("nonexistent");
			}).not.toThrow();
		});
	});
});
