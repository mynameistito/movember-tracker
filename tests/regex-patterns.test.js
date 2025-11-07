import { describe, expect, it } from "vitest";
import {
	COUNTRY_DETECTION_PATTERNS,
	CURRENCY_CODE_PATTERNS,
	DOLLAR_AMOUNT_PATTERN,
	GENERIC_RAISED_PATTERNS,
	GENERIC_TARGET_PATTERNS,
	RAISED_JSON_PATTERNS,
	RAISED_PATTERNS,
	TARGET_JSON_PATTERNS,
	TARGET_PATTERNS,
	URL_PATTERNS,
} from "../public/js/bundle.js";

describe("regex-patterns.js", () => {
	describe("URL_PATTERNS", () => {
		it("should extract subdomain from Movember URL", () => {
			const url = "https://uk.movember.com/donate/details?memberId=12345";
			const match = url.match(URL_PATTERNS.SUBDOMAIN);
			expect(match).not.toBeNull();
			expect(match[1]).toBe("uk");
		});

		it("should extract subdomain from different subdomains", () => {
			const urls = [
				"https://au.movember.com/donate/details",
				"https://us.movember.com/donate/details",
				"https://ie.movember.com/donate/details",
			];

			urls.forEach((url) => {
				const match = url.match(URL_PATTERNS.SUBDOMAIN);
				expect(match).not.toBeNull();
			});
		});

		it("should handle http URLs", () => {
			const url = "http://uk.movember.com/donate/details";
			const match = url.match(URL_PATTERNS.SUBDOMAIN);
			expect(match).not.toBeNull();
			expect(match[1]).toBe("uk");
		});
	});

	describe("CURRENCY_CODE_PATTERNS", () => {
		it("should match GBP currency codes", () => {
			const html = "GBP 1,234.56";
			expect(CURRENCY_CODE_PATTERNS[0].test(html)).toBe(true);
		});

		it("should match EUR currency codes", () => {
			const html = "EUR 1,234.56";
			expect(CURRENCY_CODE_PATTERNS[1].test(html)).toBe(true);
		});

		it("should match USD currency codes", () => {
			const html = "USD 1,234.56";
			expect(CURRENCY_CODE_PATTERNS[2].test(html)).toBe(true);
		});

		it("should match AUD currency codes", () => {
			const html = "AUD 1,234.56";
			expect(CURRENCY_CODE_PATTERNS[3].test(html)).toBe(true);
		});
	});

	describe("COUNTRY_DETECTION_PATTERNS", () => {
		it("should match Ireland patterns", () => {
			const html = "Ireland is a country";
			expect(COUNTRY_DETECTION_PATTERNS.IRELAND.test(html)).toBe(true);
		});

		it("should match United States patterns", () => {
			const html = "United States Dollar";
			expect(COUNTRY_DETECTION_PATTERNS.UNITED_STATES.test(html)).toBe(true);
		});

		it("should match Australia patterns", () => {
			const html = "Australian Dollar";
			expect(COUNTRY_DETECTION_PATTERNS.AUSTRALIA.test(html)).toBe(true);
		});
	});

	describe("DOLLAR_AMOUNT_PATTERN", () => {
		it("should match dollar amounts", () => {
			expect(DOLLAR_AMOUNT_PATTERN.test("$1,234.56")).toBe(true);
			expect(DOLLAR_AMOUNT_PATTERN.test("$500")).toBe(true);
			expect(DOLLAR_AMOUNT_PATTERN.test("$10,000")).toBe(true);
		});

		it("should not match non-dollar amounts", () => {
			expect(DOLLAR_AMOUNT_PATTERN.test("£500")).toBe(false);
			expect(DOLLAR_AMOUNT_PATTERN.test("€1,000")).toBe(false);
		});
	});

	describe("RAISED_PATTERNS", () => {
		it("should match raised amount patterns", () => {
			const html = '"AmountRaised":{"originalAmount":"1,234.56"}';
			const matched = RAISED_PATTERNS.some((pattern) => pattern.test(html));
			expect(matched).toBe(true);
		});

		it("should match CSS class patterns for raised amounts", () => {
			const html =
				'<div class="donationProgress--amount__raised">$1,234.56</div>';
			const matched = RAISED_PATTERNS.some((pattern) => pattern.test(html));
			expect(matched).toBe(true);
		});
	});

	describe("TARGET_PATTERNS", () => {
		it("should match target amount patterns", () => {
			const html = '"target":{"fundraising":{"value":"10,000"}}';
			const matched = TARGET_PATTERNS.some((pattern) => pattern.test(html));
			expect(matched).toBe(true);
		});

		it("should match CSS class patterns for target amounts", () => {
			const html =
				'<div class="donationProgress--amount__target">$10,000</div>';
			const matched = TARGET_PATTERNS.some((pattern) => pattern.test(html));
			expect(matched).toBe(true);
		});
	});

	describe("RAISED_JSON_PATTERNS", () => {
		it("should match raised amount in JSON", () => {
			const html = '{"raised":"1,234.56"}';
			const matched = RAISED_JSON_PATTERNS.some((pattern) =>
				pattern.test(html),
			);
			expect(matched).toBe(true);
		});

		it("should match raisedAmount in JSON", () => {
			const html = '{"raisedAmount":"1,234.56"}';
			const matched = RAISED_JSON_PATTERNS.some((pattern) =>
				pattern.test(html),
			);
			expect(matched).toBe(true);
		});
	});

	describe("TARGET_JSON_PATTERNS", () => {
		it("should match target amount in JSON", () => {
			const html = '{"target":"10,000"}';
			const matched = TARGET_JSON_PATTERNS.some((pattern) =>
				pattern.test(html),
			);
			expect(matched).toBe(true);
		});

		it("should match goal in JSON", () => {
			const html = '{"goal":"10,000"}';
			const matched = TARGET_JSON_PATTERNS.some((pattern) =>
				pattern.test(html),
			);
			expect(matched).toBe(true);
		});
	});

	describe("GENERIC_RAISED_PATTERNS", () => {
		it("should match generic raised patterns", () => {
			const html = "$1,234.56 raised";
			const matched = GENERIC_RAISED_PATTERNS.some((pattern) =>
				pattern.test(html),
			);
			expect(matched).toBe(true);
		});

		it('should match "raised" keyword patterns', () => {
			const html = "raised: $1,234.56";
			const matched = GENERIC_RAISED_PATTERNS.some((pattern) =>
				pattern.test(html),
			);
			expect(matched).toBe(true);
		});
	});

	describe("GENERIC_TARGET_PATTERNS", () => {
		it("should match generic target patterns", () => {
			const html = "$10,000 target";
			const matched = GENERIC_TARGET_PATTERNS.some((pattern) =>
				pattern.test(html),
			);
			expect(matched).toBe(true);
		});

		it("should match goal keyword patterns", () => {
			const html = "goal: $10,000";
			const matched = GENERIC_TARGET_PATTERNS.some((pattern) =>
				pattern.test(html),
			);
			expect(matched).toBe(true);
		});
	});
});
