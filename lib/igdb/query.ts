import { IGDB_MAX_QUERY_LENGTH } from "./constants";
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

export type ApicalypseQuery = {
  /** Visitor text, cleaned by `cleanSearchText`; escaped here. */
  search?: string;
  fields: readonly string[];
  /** Conditions joined with `&`; each is wrapped in parentheses. */
  where?: readonly string[];
  sort?: string;
  limit: number;
  offset?: number;
};

// Every C0 and C1 control character, newlines and tabs included.
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;

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
  const stripped = trimmed.replace(CONTROL_CHARACTERS, "");
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
  if (query.sort !== undefined) parts.push(`sort ${query.sort};`);
  parts.push(`limit ${int(query.limit)};`);
  if (query.offset !== undefined && query.offset > 0) {
    parts.push(`offset ${int(query.offset)};`);
  }
  return parts.join(" ");
}
