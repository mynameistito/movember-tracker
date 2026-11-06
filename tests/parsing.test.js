/* oxlint-disable vitest/prefer-to-be-truthy, vitest/prefer-to-be-falsy -- The public validator must return exact booleans. */
import { describe, expect, it } from "vitest";

import {
  calculatePercentage,
  isValidNumber,
  parseAmount,
} from "../src/client/parsing.ts";

describe("parsing.js", () => {
  describe(parseAmount, () => {
    it.each([
      ["$500", null, "500", "AUD"],
      ["$10,000", "us", "10,000", "USD"],
      ["$1,234.56", "us", "1,234.56", "USD"],
      ["USD 1,234.56", "us", "1,234.56", "USD"],

      ["£500", "uk", "500", "GBP"],
      ["€1,000", "ie", "1,000", "EUR"],
      ["$2,500", "au", "2,500", "AUD"],
      ["1,234.56", "us", "1,234.56", "USD"],
    ])("parses %s using country %s", (text, country, value, currency) => {
      expect(parseAmount(text, country)).toStrictEqual({ value, currency });
    });
  });

  describe(isValidNumber, () => {
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

  describe(calculatePercentage, () => {
    it("preserves numeric prefixes and missing-input semantics", () => {
      expect(calculatePercentage("1,234 AUD", "2,468 AUD")).toBe(50);
      expect(calculatePercentage("", "100")).toBeNaN();
      expect(calculatePercentage("100", ",")).toBeNaN();
    });

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
