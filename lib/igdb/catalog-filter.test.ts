import { describe, expect, it } from "vitest";
import summaries from "./__fixtures__/games-summaries.json";
import {
  type CatalogRecord,
  catalogWhereClause,
  isCatalogVisible,
} from "./catalog-filter";

/**
 * The catalog filter and its parity test (spec 0023, AC-10).
 *
 * The query form is checked against the exact string confirmed live, and the
 * parity test evaluates that same string, with a tiny interpreter of the
 * Apicalypse subset it uses, against every fixture record. Agreement with
 * `isCatalogVisible` means a game is never visible in search and hidden by id,
 * or the other way round. The interpreter reads the string, not the rule, so a
 * drift in either form fails here.
 */

describe("catalogWhereClause", () => {
  it("is the clause confirmed live on 2026-10-17", () => {
    expect(catalogWhereClause()).toBe(
      "(game_type = (0,4,8,9,10) | game_type = null) & (version_parent = null) & (themes = null | themes != (42))",
    );
  });
});

type RawRecord = {
  id: number;
  game_type?: number | null;
  version_parent?: number | null;
  themes?: number[] | null;
};

const FIELD: Record<string, keyof RawRecord> = {
  game_type: "game_type",
  version_parent: "version_parent",
  themes: "themes",
};

/** Evaluates `a | b` groups joined by `&`, IGDB's meaning for each operator. */
function evaluateClause(clause: string, record: RawRecord): boolean {
  return clause.split(" & ").every((group) =>
    group
      .replace(/^\(|\)$/g, "")
      .split(" | ")
      .some((condition) => {
        const match = condition.match(/^(\w+) (=|!=) (null|\(([\d,]+)\))$/);
        if (!match) throw new Error(`Unsupported condition: ${condition}`);
        const [, name, op, operand, list] = match;
        const raw = record[FIELD[name]];
        const values =
          raw === null || raw === undefined
            ? []
            : Array.isArray(raw)
              ? raw
              : [raw as number];
        if (operand === "null") return op === "=" && values.length === 0;
        const ids = list.split(",").map(Number);
        const anyIn = values.some((value) => ids.includes(value));
        return op === "=" ? anyIn : !anyIn;
      }),
  );
}

function toCatalog(record: RawRecord): CatalogRecord {
  return {
    gameType: record.game_type ?? null,
    versionParent: record.version_parent ?? null,
    themeIds: record.themes ?? [],
  };
}

/** Captured records plus the cases IGDB had no stable sample of. */
const RECORDS: (RawRecord & { visible: boolean })[] = [
  // The Witcher 3: main game, themed, no parent.
  { ...(summaries[0] as RawRecord), visible: true },
  // A main game with no themes at all.
  { ...(summaries[1] as RawRecord), visible: true },
  // An edition: hidden by its version_parent.
  { ...(summaries[2] as RawRecord), visible: false },
  { id: 900001, game_type: 1, themes: [1], visible: false }, // a DLC
  { id: 900002, game_type: 3, visible: false }, // a bundle
  { id: 900003, game_type: 8, visible: true }, // a remake
  { id: 900004, game_type: 0, themes: [42], visible: false }, // Erotic only
  { id: 900005, game_type: 0, themes: [1, 42], visible: false }, // Erotic among others
  { id: 900006, themes: [1], visible: true }, // no game_type
  { id: 900007, game_type: null, themes: [], visible: true },
];

describe("parity between the query and the rule", () => {
  it.each(RECORDS)("agrees on record $id", (record) => {
    const byQuery = evaluateClause(catalogWhereClause(), record);
    const byRule = isCatalogVisible(toCatalog(record));
    expect(byRule).toBe(byQuery);
    expect(byRule).toBe(record.visible);
  });
});
