import "server-only";
import type { IgdbErrorKind } from "./errors";

/**
 * One structured failure or retry record (spec 0023, AC-17).
 *
 * Only these fields, ever: no token, client id, secret or request body, since
 * a body can hold a visitor's search text. A successful read logs nothing.
 */
export type IgdbLogRecord = {
  event: "igdb_request_failed" | "igdb_request_retry" | "igdb_token_failed";
  endpoint: string;
  status: number | null;
  kind: IgdbErrorKind;
  attempt: number;
  elapsedMs: number;
};

export function logIgdb(record: IgdbLogRecord): void {
  console.warn(JSON.stringify(record));
}
