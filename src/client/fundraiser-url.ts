/** A validated regional member or team page. */
export interface FundraiserUrl {
  readonly type: "member" | "team";
  readonly id: string;
  readonly url: string;
}

/**
 * Parse a public HTTPS Movember page, retaining its regional host.
 * @param input - Public member or team page URL.
 * @returns Parsed fundraiser, or null for an unsupported URL.
 */
export const parseFundraiserUrl = (input: string): FundraiserUrl | null => {
  let url: URL;

  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  if (
    url.protocol !== "https:" ||
    !/^[a-z]{2,3}\.movember\.com$/u.test(url.hostname) ||
    [url.username, url.password, url.port].some((value) => value !== "")
  ) {
    return null;
  }

  const path = /^\/(?<kind>mospace|team)\/(?<id>\d+)\/?$/u.exec(url.pathname);

  const member =
    url.pathname === "/donate/details"
      ? url.searchParams.get("memberId")
      : null;

  const id = path?.groups?.id ?? member;

  if (id === null || id === undefined || !/^\d+$/u.test(id)) {
    return null;
  }

  const type = path?.groups?.kind === "team" ? "team" : "member";

  return {
    type,
    id,
    url: `https://${url.hostname}/${type === "team" ? "team" : "mospace"}/${id}`,
  };
};
