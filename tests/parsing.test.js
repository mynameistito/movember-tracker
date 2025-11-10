import { describe, expect, it } from "vitest";
import {
	calculatePercentage,
	isValidNumber,
	parseAmount,
} from "../public/js/bundle.js";

describe("parsing.js", () => {
	describe("parseAmount", () => {
		it("should parse USD amount with dollar sign", () => {
			const result = parseAmount("$1,234.56", "us");
			expect(result.value).toBe("1,234.56");
			expect(result.currency).toBe("USD");
		});

		it("should parse GBP amount with pound sign", () => {
			const result = parseAmount("£500", "uk");
			expect(result.value).toBe("500");
			expect(result.currency).toBe("GBP");
		});

		it("should parse EUR amount with euro sign", () => {
			const result = parseAmount("€1,000", "ie");
			expect(result.value).toBe("1,000");
			expect(result.currency).toBe("EUR");
		});

		it("should parse AUD amount with dollar sign", () => {
			const result = parseAmount("$2,500", "au");
			expect(result.value).toBe("2,500");
			expect(result.currency).toBe("AUD");
		});

		it("should parse amount without currency symbol", () => {
			const result = parseAmount("1,234.56", "us");
			expect(result.value).toBe("1,234.56");
			expect(result.currency).toBe("USD");
		});

		it("should default to AUD when subdomain is not provided", () => {
			const result = parseAmount("$500", null);
			expect(result.value).toBe("500");
			expect(result.currency).toBe("AUD");
		});

		it("should handle amounts with commas", () => {
			const result = parseAmount("$10,000", "us");
			expect(result.value).toBe("10,000");
			expect(result.currency).toBe("USD");
		});

		it("should handle amounts with decimals", () => {
			const result = parseAmount("$1,234.56", "us");
			expect(result.value).toBe("1,234.56");
			expect(result.currency).toBe("USD");
		});

		it("should remove currency codes from amount", () => {
			const result = parseAmount("USD 1,234.56", "us");
			expect(result.value).toBe("1,234.56");
			expect(result.currency).toBe("USD");
		});
	});

	describe("isValidNumber", () => {
		it("should validate numbers with commas", () => {
			expect(isValidNumber("1,234.56")).toBe(true);
			expect(isValidNumber("10,000")).toBe(true);
		});

		it("should validate numbers without commas", () => {
			expect(isValidNumber("1234")).toBe(true);
			expect(isValidNumber("500")).toBe(true);
		});

		it("should validate numbers with currency symbols", () => {
			expect(isValidNumber("$1,234.56")).toBe(true);
			expect(isValidNumber("£500")).toBe(true);
			expect(isValidNumber("€1,000")).toBe(true);
		});

		it("should reject non-numeric strings", () => {
			expect(isValidNumber("abc")).toBe(false);
			expect(isValidNumber("hello")).toBe(false);
		});

		it("should reject empty strings", () => {
			expect(isValidNumber("")).toBe(false);
		});

		it("should reject null or undefined", () => {
			expect(isValidNumber(null)).toBe(false);
			expect(isValidNumber(undefined)).toBe(false);
		});

		it("should reject strings with only currency symbols", () => {
			expect(isValidNumber("$")).toBe(false);
			expect(isValidNumber("£")).toBe(false);
			expect(isValidNumber("€")).toBe(false);
		});

		it("should reject strings with only commas and spaces", () => {
			expect(isValidNumber(", ,")).toBe(false);
			expect(isValidNumber("$ ,")).toBe(false);
		});
	});

	describe("calculatePercentage", () => {
		it("should calculate percentage correctly", () => {
			expect(calculatePercentage("2,500", "10,000")).toBe(25);
			expect(calculatePercentage("500", "1,000")).toBe(50);
			expect(calculatePercentage("7,500", "10,000")).toBe(75);
		});

		it("should handle amounts without commas", () => {
			expect(calculatePercentage("2500", "10000")).toBe(25);
			expect(calculatePercentage("500", "1000")).toBe(50);
		});

		it("should return 0 when target is 0", () => {
			expect(calculatePercentage("500", "0")).toBe(0);
			expect(calculatePercentage("1,000", "0")).toBe(0);
		});

		it("should round percentage correctly", () => {
			expect(calculatePercentage("333", "1000")).toBe(33);
			expect(calculatePercentage("666", "1000")).toBe(67);
		});

		it("should handle 100% correctly", () => {
			expect(calculatePercentage("10,000", "10,000")).toBe(100);
			expect(calculatePercentage("1000", "1000")).toBe(100);
		});

		it("should handle over 100% correctly", () => {
			expect(calculatePercentage("15,000", "10,000")).toBe(150);
			expect(calculatePercentage("2000", "1000")).toBe(200);
		});
	});
});
