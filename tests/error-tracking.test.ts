import { beforeEach, describe, expect, it } from "vitest";

import {
  getRecentErrors,
  trackNetworkError,
} from "../src/client/error-tracking";

describe("persisted error log", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("recovers from a malformed persisted log", () => {
    localStorage.setItem(
      "error_tracking_log",
      JSON.stringify([{ message: 12 }])
    );
    expect(getRecentErrors()).toStrictEqual([]);
    trackNetworkError(new Error("Request failed"));
    expect(getRecentErrors()).toHaveLength(1);
  });

  it("redacts sensitive content and isolates persisted records", () => {
    trackNetworkError(new Error("Request failed for user@example.com"), {
      memberId: "123456",
      url: "https://au.movember.com/donate?token=private",
    });
    const encoded = JSON.stringify(getRecentErrors());
    expect(encoded).not.toContain("user@example.com");
    expect(encoded).not.toContain("token=private");
    expect(encoded).not.toContain('"memberId":"123456"');
  });
});
