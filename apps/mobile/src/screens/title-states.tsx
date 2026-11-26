import { V1_ERROR_MESSAGES } from "@bestats/core/api/v1/errors";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { LoadingState, StatePanel } from "@/components/centered-state";
import { ApiError } from "@/lib/api";
import { screenLayout } from "@/theme/stack-options";

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

/**
 * A movie, show or game page's read: a bad id, loading and a failed read,
 * then the loaded page. Title pages get no background from the stack's layout
 * (`tabScreenLayout`), so every state here draws it and a pushed screen is
 * never see through (AGENTS.md section 3, every state). The loaded page stays
 * unwrapped: its `TitleScroll` must be the screen's first view and draws the
 * background itself (prompts/mobile-backdrop-clear-top.md).
 */
export function TitleRead<T>({
  valid,
  read,
  loadingLabel,
  children,
}: {
  valid: boolean;
  read: UseQueryResult<T>;
  loadingLabel: string;
  children: (detail: T) => ReactNode;
}) {
  if (!valid) {
    return screenLayout({
      children: <StatePanel tone="error" title={V1_ERROR_MESSAGES.not_found} />,
    });
  }
  if (read.isPending) {
    return screenLayout({
      children: <LoadingState label={loadingLabel} layout="title" />,
    });
  }
  if (read.isError) {
    return screenLayout({
      children: (
        <TitleReadError error={read.error} retry={() => read.refetch()} />
      ),
    });
  }
  return children(read.data);
}
