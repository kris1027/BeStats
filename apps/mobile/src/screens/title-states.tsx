import { V1_ERROR_MESSAGES } from "@bestats/core/api/v1/errors";

import { StatePanel } from "@/components/centered-state";
import { ApiError } from "@/lib/api";

/**
 * A title read that failed: not found ends there, anything else offers
 * Retry, with the v1 error's own message (AGENTS.md section 11).
 */
export function TitleReadError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const notFound = error instanceof ApiError && error.code === "not_found";
  return (
    <StatePanel
      tone="error"
      title={
        error instanceof ApiError ? error.message : V1_ERROR_MESSAGES.internal
      }
      action={notFound ? undefined : { label: "Retry", onPress: retry }}
    />
  );
}
