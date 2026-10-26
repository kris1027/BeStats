import { IGDB_CONTROL_CHARACTERS, IGDB_MAX_QUERY_LENGTH } from "./constants";
import { IgdbValidationError } from "./errors";

/**
 * The only builder of Apicalypse bodies, IGDB's query language (spec 0023,
 * AC-5). Pure, so the tests and the live check read it directly.
 *
 * This file is the injection boundary. Numbers are checked to be integers
 * before they are written, and visitor text only ever lands inside one quoted
 * `search` string, escaped so it can never close that string and add its own
 * clauses.
 */

/** An IGDB field a query filters or sorts on. A closed list, never caller text. */
export type IgdbField =
  | "id"
  | "name"
  | "game_type"
  | "version_parent"
  | "themes"
  | "genres"
  | "platforms"
  | "first_release_date"
  | "rating"
  | "rating_count"
  | "hypes"
  | "popularity_type"
  | "value";

declare const conditionBrand: unique symbol;

/**
 * One `where` condition. Only the builders in `cond` make one, so a raw string
 * cannot reach a body through `where` any more than through `search`.
 */
export type Condition = string & { readonly [conditionBrand]: true };

export type Sort = { field: IgdbField; direction: "asc" | "desc" };

export type ApicalypseQuery = {
  /** Visitor text, cleaned by `cleanSearchText`; escaped here. */
  search?: string;
  fields: readonly string[];
  /** Conditions joined with `&`; each is wrapped in parentheses. */
  where?: readonly Condition[];
  sort?: Sort;
  limit: number;
  offset?: number;
};

/**
 * Cleans visitor search text, the first four steps of the order AC-5 fixes:
 * trim, reject if empty, strip control characters, check 1 to 100 characters.
 * The fifth, escaping, happens in `buildQuery`, so cleaning twice is harmless
 * and text can never be escaped twice.
 *
 * @throws {IgdbValidationError} On `query` when the text is empty or too long.
 */
export function cleanSearchText(text: unknown): string {
  if (typeof text !== "string") {
    throw new IgdbValidationError("query", "The search query must be text.");
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new IgdbValidationError("query", "The search query is empty.");
  }
  const stripped = trimmed.replace(IGDB_CONTROL_CHARACTERS, "");
  if (stripped.length < 1 || stripped.length > IGDB_MAX_QUERY_LENGTH) {
    throw new IgdbValidationError(
      "query",
      `The search query must be 1 to ${IGDB_MAX_QUERY_LENGTH} characters.`,
    );
  }
  return stripped;
}

/** Escapes backslash, then double quote, so text cannot close its string. */
export function escapeSearchText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Writes an integer, or refuses. The last line of defence behind the
 * validation in `validation.ts`, so a non integer can never reach a body.
 */
export function int(value: number): string {
  if (!Number.isSafeInteger(value)) {
    throw new IgdbValidationError("id", "Expected an integer.");
  }
  return String(value);
}

/** Writes `(1,2,3)`, IGDB's "any of" list. */
export function intList(values: readonly number[]): string {
  if (values.length === 0) {
    throw new IgdbValidationError("id", "Expected at least one id.");
  }
  return `(${values.map(int).join(",")})`;
}

/** Writes a finite number, or refuses; a rating bound may be fractional. */
function finite(value: number): string {
  if (!Number.isFinite(value)) {
    throw new IgdbValidationError("filter", "Expected a finite number.");
  }
  return String(value);
}

function asCondition(text: string): Condition {
  return text as Condition;
}

/**
 * The only way to write a `where` condition (AC-5). Every value goes through
 * `int`, `intList` or `finite`, and every field is an `IgdbField`, so a
 * condition holds nothing a caller typed. IGDB's meaning: `= (…)` matches any
 * of the ids, `= […]` all of them, `!= (…)` none of them, and `= null` a
 * missing value or an empty list.
 */
export const cond = {
  is: (field: IgdbField, value: number) =>
    asCondition(`${field} = ${int(value)}`),
  anyOf: (field: IgdbField, ids: readonly number[]) =>
    asCondition(`${field} = ${intList(ids)}`),
  /** Every one of the ids, IGDB's `[…]` list (spec 0029, AC-7). */
  allOf: (field: IgdbField, ids: readonly number[]) =>
    asCondition(`${field} = [${intList(ids).slice(1, -1)}]`),
  noneOf: (field: IgdbField, ids: readonly number[]) =>
    asCondition(`${field} != ${intList(ids)}`),
  isNull: (field: IgdbField) => asCondition(`${field} = null`),
  notNull: (field: IgdbField) => asCondition(`${field} != null`),
  atLeast: (field: IgdbField, value: number) =>
    asCondition(`${field} >= ${finite(value)}`),
  below: (field: IgdbField, value: number) =>
    asCondition(`${field} < ${finite(value)}`),
  /** Any of the conditions, as one parenthesised group. */
  either: (conditions: readonly Condition[]) =>
    asCondition(`(${conditions.join(" | ")})`),
  /** All of the conditions. */
  all: (conditions: readonly Condition[]) =>
    asCondition(conditions.join(" & ")),
};

/** Builds the body. Clause order follows IGDB's documentation. */
export function buildQuery(query: ApicalypseQuery): string {
  const parts: string[] = [];
  if (query.search !== undefined) {
    parts.push(`search "${escapeSearchText(cleanSearchText(query.search))}";`);
  }
  parts.push(`fields ${query.fields.join(",")};`);
  if (query.where && query.where.length > 0) {
    parts.push(
      `where ${query.where.map((condition) => `(${condition})`).join(" & ")};`,
    );
  }
  if (query.sort !== undefined) {
    parts.push(`sort ${query.sort.field} ${query.sort.direction};`);
  }
  parts.push(`limit ${int(query.limit)};`);
  if (query.offset !== undefined && query.offset > 0) {
    parts.push(`offset ${int(query.offset)};`);
  }
  return parts.join(" ");
}
