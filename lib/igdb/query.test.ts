import { describe, expect, it } from "vitest";
import { IgdbValidationError } from "./errors";
import {
  buildQuery,
  cleanSearchText,
  escapeSearchText,
  intList,
} from "./query";

/**
 * The Apicalypse builder, the injection boundary for visitor search text
 * (spec 0023, AC-5).
 */

describe("cleanSearchText", () => {
  it("trims, then strips control characters, newlines included", () => {
    expect(cleanSearchText("  zel\nda\t\u0000 ")).toBe("zelda");
  });

  it("rejects an empty query, before and after stripping", () => {
    for (const text of ["", "   ", "\n\u0007"]) {
      expect(() => cleanSearchText(text)).toThrow(IgdbValidationError);
    }
  });

  it("accepts 100 characters and refuses 101", () => {
    expect(cleanSearchText("a".repeat(100))).toHaveLength(100);
    expect(() => cleanSearchText("a".repeat(101))).toThrow(IgdbValidationError);
  });

  it("names the field and never the text", () => {
    try {
      cleanSearchText("x".repeat(200));
    } catch (error) {
      expect((error as IgdbValidationError).field).toBe("query");
      expect((error as Error).message).not.toContain("xxx");
    }
  });
});

describe("escapeSearchText", () => {
  it("escapes backslash before double quote", () => {
    expect(escapeSearchText('a\\"b')).toBe('a\\\\\\"b');
  });
});

describe("buildQuery", () => {
  it("writes the clauses in IGDB's order", () => {
    expect(
      buildQuery({
        search: "zelda",
        fields: ["name", "cover.image_id"],
        where: ["genres = (5,9)", "rating >= 70"],
        limit: 21,
        offset: 20,
      }),
    ).toBe(
      'search "zelda"; fields name,cover.image_id; where (genres = (5,9)) & (rating >= 70); limit 21; offset 20;',
    );
  });

  it("keeps an injection attempt inside the one quoted search string", () => {
    const body = buildQuery({
      search: 'zelda"; where id = 1;',
      fields: ["name"],
      limit: 1,
    });

    expect(body).toBe(
      'search "zelda\\"; where id = 1;"; fields name; limit 1;',
    );
    // Exactly one unescaped quote pair, so the text cannot add a clause.
    expect(body.match(/(?<!\\)"/g)).toHaveLength(2);
  });

  it("cannot be closed with a trailing backslash", () => {
    const body = buildQuery({ search: "zelda\\", fields: ["name"], limit: 1 });
    expect(body).toBe('search "zelda\\\\"; fields name; limit 1;');
  });

  it("refuses a non integer anywhere a number is written", () => {
    expect(() => intList([1, 2.5])).toThrow(IgdbValidationError);
    expect(() => intList([])).toThrow(IgdbValidationError);
    expect(() => buildQuery({ fields: ["name"], limit: Number.NaN })).toThrow(
      IgdbValidationError,
    );
  });
});
