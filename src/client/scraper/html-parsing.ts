/**
 * HTML parsing logic for extracting donation amounts from Movember pages
 */

import { formatDuration } from "../formatting.js";
import { logger } from "../logger.js";
import { isValidNumber } from "../parsing.js";
import {
  GENERIC_RAISED_PATTERNS,
  GENERIC_TARGET_PATTERNS,
  RAISED_JSON_PATTERNS,
  RAISED_PATTERNS,
  TARGET_JSON_PATTERNS,
  TARGET_PATTERNS,
} from "../regex-patterns.js";

/** Raised and goal amounts extracted from a fundraiser page. */
export interface ExtractedAmounts {
  raised: string;
  target: string;
}

const elementAmount = (
  element: HTMLElement,
  attributes: readonly string[]
): string => {
  const match = /[\d,]+(?:\.\d+)?/u.exec(element.textContent ?? "");

  if (match && isValidNumber(match[0])) {
    return match[0];
  }

  return (
    attributes
      .map((key) => element.dataset[key])
      .find((value) => isValidNumber(value)) ?? ""
  );
};

const scriptAmount = (
  document: Document,
  patterns: readonly RegExp[]
): string => {
  for (const script of document.querySelectorAll("script")) {
    for (const pattern of patterns) {
      const amount = pattern.exec(script.textContent ?? "")?.[1];

      if (isValidNumber(amount)) {
        return amount ?? "";
      }
    }
  }

  return "";
};

const extractFromDOM = (
  html: string,
  selectors: readonly string[],
  attributes: readonly string[],
  patterns: readonly RegExp[]
): string => {
  try {
    const document = new DOMParser().parseFromString(html, "text/html");

    for (const selector of selectors) {
      for (const element of document.querySelectorAll<HTMLElement>(selector)) {
        const amount = elementAmount(element, attributes);

        if (amount !== "") {
          return amount;
        }
      }
    }

    return scriptAmount(document, patterns);
  } catch (error) {
    logger.debug("[SCRAPE]", "DOM parsing failed; using text patterns", error);

    return "";
  }
};

/**
 * Extract raised amount from HTML using DOMParser (primary method)
 * Falls back to regex if DOMParser fails or doesn't find results
 * @param html - The HTML content to parse
 * @returns The extracted raised amount or empty string if not found
 */
const extractRaisedAmountWithDOMParser = (html: string): string =>
  extractFromDOM(
    html,
    [
      // Team page selectors
      "div.mospace-heroarea--donations-target-amount-wrapper > h1",
      "div.mospace-heroarea--donations-target-amount-wrapper h1",
      // Member page selectors
      "span.donationProgress--amount__raised",
      "span[class*='donationProgress--amount__raised']",
      ".donationProgress--amount__raised",
      '[class*="donationProgress--amount__raised"]',
      '[class*="raised"]',
      "[data-raised]",
      "[data-amount]",
      "[data-raised-amount]",
    ],
    ["raised", "amount", "raisedAmount"],
    RAISED_JSON_PATTERNS
  );

const patternAmount = (
  html: string,
  patterns: readonly RegExp[],
  firstCapture: boolean
): string => {
  for (const pattern of patterns) {
    const match = pattern.exec(html);

    if (match === null) {
      continue;
    }

    const captures = firstCapture ? match.slice(1, 2) : match.slice(1);

    let amount = "";

    for (const value of captures) {
      if (isValidNumber(value)) {
        amount = value;
      }
    }

    if (amount !== "") {
      return amount;
    }
  }

  return "";
};

const fallbackScriptAmount = (
  html: string,
  patterns: readonly RegExp[]
): string => {
  for (const script of html.matchAll(/<script[^>]*>[\s\S]*?<\/script>/giu)) {
    const amount = patternAmount(script[0], patterns, true);

    if (amount !== "") {
      return amount;
    }
  }

  return "";
};

const contextAmount = (
  html: string,
  weights: readonly (readonly [RegExp, number])[]
): string => {
  let selected = "";
  let bestScore = 0;

  for (const match of html.matchAll(/\$(?<amount>[\d,]+(?:\.\d+)?)/gu)) {
    const [, amount] = match;

    if (!isValidNumber(amount)) {
      continue;
    }

    const index = match.index ?? 0;

    const context = html
      .slice(
        Math.max(0, index - 300),
        Math.min(html.length, index + match[0].length + 300)
      )
      .toLowerCase();

    const score = weights.reduce(
      (total, [pattern, weight]) =>
        total + (pattern.test(context) ? weight : 0),
      0
    );

    if (score > bestScore) {
      selected = amount;
      bestScore = score;
    }
  }

  return selected;
};

/**
 * Extract raised amount from HTML using multiple pattern strategies
 * Tries DOMParser first, then falls back to regex patterns
 * @param html - The HTML content to parse
 * @returns The extracted raised amount or empty string if not found
 */
export const extractRaisedAmount = (html: string): string => {
  const structured =
    extractRaisedAmountWithDOMParser(html) ||
    patternAmount(html, RAISED_PATTERNS, false) ||
    fallbackScriptAmount(html, RAISED_JSON_PATTERNS);

  return (
    structured ||
    patternAmount(html, GENERIC_RAISED_PATTERNS, true) ||
    contextAmount(html, [
      [
        /(?:raised|donated|collected|current|funds?|progress|amount\s*(?:raised|donated))/iu,
        10,
      ],
      [
        /(?:has\s+raised|has\s+donated|has\s+collected|currently\s+raised)/iu,
        5,
      ],
      [/\$[\d,]+(?:\.\d+)?\s*(?:raised|donated|collected)/iu, 8],
    ])
  );
};

/**
 * Extract target amount from HTML using DOMParser (primary method)
 * Falls back to regex if DOMParser fails or doesn't find results
 * @param html - The HTML content to parse
 * @returns The extracted target amount or empty string if not found
 */
const extractTargetAmountWithDOMParser = (html: string): string =>
  extractFromDOM(
    html,
    [
      // Team page selectors
      "#mospace-heroarea--donations-target-text",
      '[id*="mospace-heroarea--donations-target-text"]',
      // Member page selectors
      "span.donationProgress--amount__target",
      "span[class*='donationProgress--amount__target']",
      ".donationProgress--amount__target",
      '[class*="donationProgress--amount__target"]',
      '[class*="target"]',
      '[class*="goal"]',
      "[data-target]",
      "[data-goal]",
      "[data-target-amount]",
    ],
    ["target", "goal", "targetAmount"],
    TARGET_JSON_PATTERNS
  );

/**
 * Extract target amount from HTML using multiple pattern strategies
 * Tries DOMParser first, then falls back to regex patterns
 * @param html - The HTML content to parse
 * @returns The extracted target amount or empty string if not found
 */
export const extractTargetAmount = (html: string): string => {
  const structured =
    extractTargetAmountWithDOMParser(html) ||
    patternAmount(html, TARGET_PATTERNS, false) ||
    fallbackScriptAmount(html, TARGET_JSON_PATTERNS);

  return (
    structured ||
    patternAmount(html, GENERIC_TARGET_PATTERNS, false) ||
    contextAmount(html, [
      [/(?:target|goal|aim|objective|of\s+\$)/iu, 10],
      [/(?:target\s+(?:of|is)|goal\s+(?:of|is)|aim\s+(?:of|is))/iu, 5],
      [/\$[\d,]+(?:\.\d+)?\s*(?:target|goal)/iu, 8],
    ])
  );
};

/**
 * Extract both raised and target amounts from HTML
 * @param html - The HTML content to parse
 * @param memberId - The member ID (for logging)
 * @param subdomain - The subdomain (for logging)
 * @returns Object containing extracted amounts
 */
export const extractAmounts = (
  html: string,
  memberId: string,
  subdomain: string
): ExtractedAmounts => {
  const extractStart = Date.now();
  logger.info("[SCRAPE]", "Extracting data from HTML...");

  const raised = extractRaisedAmount(html);
  const target = extractTargetAmount(html);

  const extractDuration = Date.now() - extractStart;
  logger.info(
    "[SCRAPE]",
    `Data extraction completed in ${formatDuration(extractDuration)}`
  );
  logger.debug(
    "[SCRAPE]",
    `Raw extracted data for memberId ${memberId} (subdomain: ${subdomain}):`,
    {
      raised: raised || "NOT FOUND",
      target: target || "NOT FOUND",
    }
  );

  return { raised, target };
};
