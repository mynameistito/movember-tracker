import { describe, expect, it } from "vitest";

import { parseFundraiserUrl } from "../src/client/fundraiser-url";

describe("regional fundraiser URLs", () => {
  it.each(["au", "nz", "uk", "us"])(
    "preserves the %s region for both fundraiser types",
    (region) => {
      for (const [path, type, id] of [
        ["mospace", "member", "13728913"],
        ["team", "team", "2470730"],
      ]) {
        const url = `https://${region}.movember.com/${path}/${id}`;
        expect(parseFundraiserUrl(`${url}/?share=1#top`)).toStrictEqual({
          type,
          id,
          url,
        });
      }
    }
  );

  it("accepts legacy member links", () => {
    expect(
      parseFundraiserUrl(
        "https://nz.movember.com/donate/details?memberId=13728913"
      )?.url
    ).toBe("https://nz.movember.com/mospace/13728913");
  });

  it.each([
    "https://au.movember.com.evil.test/team/123",
    // oxlint-disable-next-line sonarjs/no-clear-text-protocols -- Regression: reject insecure input.
    "http://au.movember.com/team/123",
    "https://user@au.movember.com/team/123",
    "https://au.movember.com:8443/team/123",
    "https://au.movember.com/team/nope",
    "https://au.movember.com/",
    "garbage",
  ])("rejects invalid input %s", (url) => {
    expect(parseFundraiserUrl(url)).toBeNull();
  });
});
