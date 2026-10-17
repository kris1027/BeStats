import { describe, expect, it } from "vitest";
import { IgdbValidationError } from "./errors";
import {
  buildQuery,
  cleanSearchText,
  cond,
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
        where: [cond.anyOf("genres", [5, 9]), cond.atLeast("rating", 70)],
        sort: { field: "rating", direction: "desc" },
        limit: 21,
        offset: 20,
      }),
    ).toBe(
      'search "zelda"; fields name,cover.image_id; where (genres = (5,9)) & (rating >= 70); sort rating desc; limit 21; offset 20;',
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

describe("cond", () => {
  it("writes each condition from a field and checked numbers only", () => {
    expect(cond.is("id", 1942)).toBe("id = 1942");
    expect(cond.anyOf("genres", [5, 9])).toBe("genres = (5,9)");
    expect(cond.noneOf("themes", [42])).toBe("themes != (42)");
    expect(cond.isNull("game_type")).toBe("game_type = null");
    expect(cond.notNull("rating")).toBe("rating != null");
    expect(cond.atLeast("rating", 72.5)).toBe("rating >= 72.5");
    expect(cond.below("first_release_date", 100)).toBe(
      "first_release_date < 100",
    );
  });

  it("groups any of in parentheses and joins all of with &", () => {
    const group = cond.either([
      cond.isNull("themes"),
      cond.noneOf("themes", [42]),
    ]);
    expect(group).toBe("(themes = null | themes != (42))");
    expect(cond.all([group, cond.isNull("version_parent")])).toBe(
      "(themes = null | themes != (42)) & version_parent = null",
    );
  });

  it("refuses a value that is not a checked number", () => {
    expect(() => cond.is("id", 1.5)).toThrow(IgdbValidationError);
    expect(() => cond.anyOf("id", [])).toThrow(IgdbValidationError);
    expect(() => cond.atLeast("rating", Number.NaN)).toThrow(
      IgdbValidationError,
    );
  });
});
