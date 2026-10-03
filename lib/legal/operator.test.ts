import { describe, expect, it } from "vitest";

import {
  COMPLAINT_RESPONSE_DAYS,
  CONTACT_EMAIL,
  DELETION_DAYS,
  LEGAL_LAST_UPDATED,
  MINIMUM_AGE,
  OPERATOR_COUNTRY,
  OPERATOR_NAME,
  PROCESSORS,
  RIGHTS_RESPONSE,
  SUPERVISORY_AUTHORITY,
} from "./operator";

/**
 * covers: spec 0017, AC-10
 *
 * The legal pages render these values and nothing else, so an empty or
 * malformed one would publish a broken policy. No clock comparison: the date
 * only has to be a real calendar day.
 */
describe("the operator facts", () => {
  it("are all present", () => {
    for (const value of [
      OPERATOR_NAME,
      OPERATOR_COUNTRY,
      RIGHTS_RESPONSE,
      SUPERVISORY_AUTHORITY.name,
      SUPERVISORY_AUTHORITY.address,
    ]) {
      expect(value.trim()).not.toBe("");
    }
    for (const days of [DELETION_DAYS, COMPLAINT_RESPONSE_DAYS, MINIMUM_AGE]) {
      expect(Number.isInteger(days) && days > 0).toBe(true);
    }
  });

  it("carry a valid contact email", () => {
    expect(CONTACT_EMAIL).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  });

  it("date the pages with a real YYYY-MM-DD day", () => {
    expect(LEGAL_LAST_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const parsed = new Date(`${LEGAL_LAST_UPDATED}T00:00:00Z`);
    expect(parsed.toISOString().slice(0, 10)).toBe(LEGAL_LAST_UPDATED);
  });

  it("link every processor and the authority over https", () => {
    expect(PROCESSORS.length).toBeGreaterThan(0);
    for (const processor of PROCESSORS) {
      expect(processor.name.trim()).not.toBe("");
      expect(processor.purpose.trim()).not.toBe("");
      expect(processor.url).toMatch(/^https:\/\//);
    }
    expect(SUPERVISORY_AUTHORITY.url).toMatch(/^https:\/\//);
  });
});
