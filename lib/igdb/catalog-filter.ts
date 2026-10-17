import { IGDB_EROTIC_THEME_ID, IGDB_VISIBLE_GAME_TYPES } from "./constants";

/**
 * The catalog filter, one rule used two ways (spec 0023, AC-10).
 *
 * A game is visible when its game type is a main game, standalone expansion,
 * remake, remaster or expanded game; it has no `version_parent` (so a Deluxe
 * or GOTY edition is hidden); and it does not carry the Erotic theme. A missing
 * game type or missing themes pass on those counts.
 *
 * The rule is data, `CATALOG_RULE`, and both forms are derived from it:
 * `catalogWhereClause` writes it into a search or discover query, and
 * `isCatalogVisible` evaluates it on a record read by id. Deriving both from
 * one value is what keeps a game from being visible in one path and hidden in
 * the other; the parity test runs fixture records through both. Pure, so the
 * live check and the tests import it directly.
 */

/** The record fields the rule reads, ids only. */
export type CatalogRecord = {
  gameType: number | null;
  versionParent: number | null;
  themeIds: readonly number[];
};

type Field = keyof CatalogRecord;

/** One test on one field. Several in a clause combine with OR. */
type Condition =
  | { field: Field; op: "is_null" }
  | { field: Field; op: "any_of"; ids: readonly number[] }
  | { field: Field; op: "none_of"; ids: readonly number[] };

/** Clauses combine with AND. */
type Rule = readonly (readonly Condition[])[];

const IGDB_FIELD: Record<Field, string> = {
  gameType: "game_type",
  versionParent: "version_parent",
  themeIds: "themes",
};

const VISIBLE_GAME_TYPE_IDS = Object.keys(IGDB_VISIBLE_GAME_TYPES).map(Number);

export const CATALOG_RULE: Rule = [
  [
    { field: "gameType", op: "any_of", ids: VISIBLE_GAME_TYPE_IDS },
    { field: "gameType", op: "is_null" },
  ],
  [{ field: "versionParent", op: "is_null" }],
  [
    { field: "themeIds", op: "is_null" },
    { field: "themeIds", op: "none_of", ids: [IGDB_EROTIC_THEME_ID] },
  ],
];

function writeCondition(condition: Condition): string {
  const field = IGDB_FIELD[condition.field];
  switch (condition.op) {
    case "is_null":
      return `${field} = null`;
    case "any_of":
      return `${field} = (${condition.ids.join(",")})`;
    case "none_of":
      return `${field} != (${condition.ids.join(",")})`;
  }
}

/**
 * The rule as one Apicalypse `where` condition, confirmed live on 2026-10-17:
 * `(game_type = (0,4,8,9,10) | game_type = null) & (version_parent = null) &
 * (themes = null | themes != (42))`.
 */
export function catalogWhereClause(rule: Rule = CATALOG_RULE): string {
  return rule
    .map((clause) => `(${clause.map(writeCondition).join(" | ")})`)
    .join(" & ");
}

function valuesOf(record: CatalogRecord, field: Field): readonly number[] {
  const value = record[field];
  if (value === null) return [];
  return typeof value === "number" ? [value] : value;
}

/**
 * IGDB's meaning of each operator: `= null` matches a missing value or an
 * empty list, `= (…)` matches when any value is in the list, and `!= (…)` when
 * none is.
 */
function holds(record: CatalogRecord, condition: Condition): boolean {
  const values = valuesOf(record, condition.field);
  switch (condition.op) {
    case "is_null":
      return values.length === 0;
    case "any_of":
      return values.some((value) => condition.ids.includes(value));
    case "none_of":
      return values.every((value) => !condition.ids.includes(value));
  }
}

/** True when a record passes the rule, the same answer the query gives. */
export function isCatalogVisible(
  record: CatalogRecord,
  rule: Rule = CATALOG_RULE,
): boolean {
  return rule.every((clause) =>
    clause.some((condition) => holds(record, condition)),
  );
}
