/**
 * Subdomain detection logic for Movember pages
 */

import { getCachedSubdomain, setCachedSubdomain } from "../cache.js";
import {
  DEFAULT_SUBDOMAIN,
  MEMBER_SUBDOMAIN_MAP,
  SUBDOMAIN_CACHE_TTL,
} from "../constants.js";
import { logger } from "../logger.js";
import {
  COUNTRY_DETECTION_PATTERNS,
  CURRENCY_CODE_PATTERNS,
  DOLLAR_AMOUNT_PATTERN,
} from "../regex-patterns.js";
import {
  buildMovemberUrl,
  buildTeamUrl,
  extractSubdomainFromUrl,
  fetchViaProxy,
  ProxyRequestError,
} from "./network.js";

/**
 * Detect subdomain from HTML content by checking currency symbols
 * This is used for verification - if currency doesn't match URL subdomain, we skip it
 * Made more aggressive: checks for currency symbols anywhere, not just near amounts
 * @param html - The HTML content to analyze
 * @returns The detected subdomain or null if not found
 */
const euroCountry = (html: string): string => {
  const candidates = [
    ["ie", COUNTRY_DETECTION_PATTERNS.IRELAND],
    ["nl", COUNTRY_DETECTION_PATTERNS.NETHERLANDS],
    ["de", COUNTRY_DETECTION_PATTERNS.GERMANY],
    ["fr", COUNTRY_DETECTION_PATTERNS.FRANCE],
    ["es", COUNTRY_DETECTION_PATTERNS.SPAIN],
    ["it", COUNTRY_DETECTION_PATTERNS.ITALY],
  ] as const;

  return candidates.find(([, pattern]) => pattern.test(html))?.[0] ?? "ie";
};

/**
 * Infer a fundraiser country from currency and country text, preserving symbol precedence.
 * @param html - Movember page content.
 * @returns Country subdomain or null when there is no evidence.
 */
export const detectSubdomainFromHtml = (
  html: string | null | undefined
): string | null => {
  if (html === null || html === undefined || html === "") {
    return null;
  }

  if (["£", "&pound;", "&#163;"].some((symbol) => html.includes(symbol))) {
    return "uk";
  }

  if (["€", "&euro;", "&#8364;"].some((symbol) => html.includes(symbol))) {
    return euroCountry(html);
  }

  const countries = [
    "uk",
    "ie",
    "us",
    "au",
    "ca",
    "nz",
    "za",
    "cz",
    "se",
    "dk",
  ];

  for (const [index, country] of countries.entries()) {
    if (CURRENCY_CODE_PATTERNS[index].test(html)) {
      return country === "ie" ? euroCountry(html) : country;
    }
  }

  if (!DOLLAR_AMOUNT_PATTERN.test(html)) {
    return null;
  }

  const dollarCountries = [
    ["us", COUNTRY_DETECTION_PATTERNS.UNITED_STATES],
    ["ca", COUNTRY_DETECTION_PATTERNS.CANADA],
    ["nz", COUNTRY_DETECTION_PATTERNS.NEW_ZEALAND],
    ["au", COUNTRY_DETECTION_PATTERNS.AUSTRALIA],
  ] as const;

  return dollarCountries.find(([, pattern]) => pattern.test(html))?.[0] ?? "au";
};

const countries = [
  "au",
  "uk",
  "us",
  "ca",
  "nz",
  "ie",
  "za",
  "nl",
  "de",
  "fr",
  "es",
  "it",
  "cz",
  "dk",
  "se",
  "ex",
];

interface CountryProbe {
  confirmed?: string;
  fallback?: string;
}

const probeCountry = async (
  type: "member" | "team",
  id: string,
  country: string,
  signal?: AbortSignal
): Promise<CountryProbe> => {
  const url =
    type === "team" ? buildTeamUrl(id, country) : buildMovemberUrl(id, country);

  try {
    const { html, finalUrl } = await fetchViaProxy(url, signal);
    const redirected = extractSubdomainFromUrl(finalUrl);

    if (redirected !== null && redirected !== country) {
      return { confirmed: redirected };
    }

    if (html.length <= 1000) {
      return {};
    }

    const detected = detectSubdomainFromHtml(html);

    return detected === null
      ? { fallback: redirected ?? country }
      : { confirmed: detected };
  } catch (error) {
    signal?.throwIfAborted();

    if (!(error instanceof ProxyRequestError) || error.status !== 404) {
      throw error;
    }

    logger.debug(
      "[SUBDOMAIN]",
      `Could not verify ${country} for ${type} ${id}`,
      error
    );

    return {};
  }
};

const discoverCountry = async (
  type: "member" | "team",
  id: string,
  index = 0,
  fallback?: string,
  signal?: AbortSignal
): Promise<string | undefined> => {
  const country = countries[index];

  if (country === undefined) {
    return fallback;
  }

  const probe = await probeCountry(type, id, country, signal);

  if (probe.confirmed !== undefined) {
    return probe.confirmed;
  }

  return await discoverCountry(
    type,
    id,
    index + 1,
    fallback ?? probe.fallback,
    signal
  );
};

const detectCountry = async (
  type: "member" | "team",
  id: string,
  force: boolean,
  signal?: AbortSignal
): Promise<string> => {
  const override = type === "member" ? MEMBER_SUBDOMAIN_MAP[id] : undefined;

  if (override !== undefined) {
    setCachedSubdomain(type, id, override, SUBDOMAIN_CACHE_TTL);

    return override;
  }

  if (!force) {
    const cached = getCachedSubdomain(type, id);

    if (cached !== null) {
      return cached;
    }
  }

  const detected = await discoverCountry(type, id, 0, undefined, signal);

  if (detected !== undefined) {
    setCachedSubdomain(type, id, detected, SUBDOMAIN_CACHE_TTL);

    return detected;
  }

  // A failed probe is not evidence of country; leave the routing cache empty.
  return DEFAULT_SUBDOMAIN;
};

/**
 * Resolve a member's country using overrides, cache, redirects, and page evidence.
 * @param memberId - Movember member ID.
 * @param signal - Cancels discovery when its caller is disposed.
 * @param forceRefresh - Skip the routing cache when true.
 * @returns Country subdomain, or the uncached default when discovery fails.
 */
export const detectSubdomainForMember = async (
  memberId: string,
  forceRefresh = false,
  signal?: AbortSignal
): Promise<string> =>
  await detectCountry("member", memberId, forceRefresh, signal);

/**
 * Resolve a team's country from cached or current page evidence.
 * @param teamId - Movember team ID.
 * @param signal - Cancels discovery when its caller is disposed.
 * @param forceRefresh - Skip the routing cache when true.
 * @returns Country subdomain, or the uncached default when discovery fails.
 */
export const detectSubdomainForTeam = async (
  teamId: string,
  forceRefresh = false,
  signal?: AbortSignal
): Promise<string> => await detectCountry("team", teamId, forceRefresh, signal);

/**
 * Get the cached or discovered member country.
 * @param memberId - Movember member ID.
 * @param signal - Cancels discovery when its caller is disposed.
 * @returns Country subdomain.
 */
export const getSubdomainForMember = async (
  memberId: string,
  signal?: AbortSignal
): Promise<string> => await detectSubdomainForMember(memberId, false, signal);

/**
 * Get the cached or discovered team country.
 * @param teamId - Movember team ID.
 * @param signal - Cancels discovery when its caller is disposed.
 * @returns Country subdomain.
 */
export const getSubdomainForTeam = async (
  teamId: string,
  signal?: AbortSignal
): Promise<string> => await detectSubdomainForTeam(teamId, false, signal);
