import { describe, expect, it } from "vitest";

import { checkAppVersion, compareSemver, MIN_APP_VERSION } from "./version";

describe("compareSemver", () => {
  it("compares each part as a number", () => {
    expect(compareSemver("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareSemver("0.9.9", "1.0.0")).toBeLessThan(0);
    expect(compareSemver("2.0.1", "2.0.1")).toBe(0);
  });
});

describe("checkAppVersion", () => {
  it("serves the minimum and anything newer", () => {
    expect(checkAppVersion(MIN_APP_VERSION)).toBe("ok");
    expect(checkAppVersion("1.0.1")).toBe("ok");
    expect(checkAppVersion("12.3.0")).toBe("ok");
  });

  it("asks an older app to update", () => {
    expect(checkAppVersion("0.9.0")).toBe("upgrade_required");
  });

  it("refuses a missing or malformed header", () => {
    for (const header of [null, "", "1.0", "1.0.0-beta", "v1.0.0", "01.0.0"]) {
      expect(checkAppVersion(header)).toBe("invalid");
    }
  });
});
