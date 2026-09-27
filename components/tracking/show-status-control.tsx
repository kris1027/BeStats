"use client";

import { cn } from "cn";
import { ChevronDownIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useOptimistic } from "react";
import { toast } from "sonner";

import { restoreShowStatus, setShowStatus } from "@/app/shows/actions";
import { glassPillClassName } from "@/components/glass-pill";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SHOW_STATUS_MESSAGES,
  TV_STATUS_LABELS,
  UNDO_ACTION_LABEL,
} from "@/lib/tracking/messages";
import {
  type ShowStatusState,
  type ShowStatusUndo,
  TV_STATUSES,
  type TvStatus,
} from "@/lib/tracking/types";

import { ShowStatusIcon } from "./show-status-icon";
import { settleStatusCall, showStatusError } from "./tracking-toast";

/** The pill recipe at the touch sizes: 44px on mobile, 36px from `md`. */
const PILL =
  "h-11 cursor-pointer px-4 transition-[filter] hover:brightness-125 md:h-9 md:px-3.5";

/** Long enough for a keyboard user to reach Undo; the server allows 10 min. */
const UNDO_TOAST_MS = 10_000;

/**
 * The show hero's status pill and its menu (spec 0013, AC-1 to AC-4).
 *
 * The pill names the current status, or "Add to my shows" when there is no
 * row. The menu lists the five statuses as one radio group with the current
 * one checked, then, only when a row exists, "Remove status". Choosing the
 * status the show already has sends nothing: a status the system set would
 * otherwise silently become the user's (AC-2).
 *
 * The label is optimistic, as the movie pills are: it changes at once and
 * lasts while the action runs, then gives way to the prop `refresh()`
 * delivers, or, on failure, to the unchanged prop, which is the rollback.
 * A removal confirms itself with a toast that carries the Undo (AC-4).
 *
 * @param showName The TMDB name, for the accessible name and the toasts.
 * @param returnPath Where the session expired toast's Sign in comes back to.
 */
function ShowStatusControl({
  showId,
  showName,
  state,
  returnPath,
}: {
  showId: number;
  showName: string;
  state: ShowStatusState | null;
  returnPath: string;
}) {
  const router = useRouter();
  const [shown, setShown] = useOptimistic(state);
  const toastId = `show-status-${showId}`;

  function fail(error: Parameters<typeof showStatusError>[0]) {
    showStatusError(error, { id: toastId, returnPath, navigate: router.push });
  }

  function choose(status: TvStatus) {
    if (shown?.status === status) return;
    startTransition(async () => {
      setShown({ status, source: "user" });
      const result = await settleStatusCall(() =>
        setShowStatus(showId, status),
      );
      if (!result.ok) fail(result.error);
    });
  }

  function remove() {
    startTransition(async () => {
      setShown(null);
      const result = await settleStatusCall(() => setShowStatus(showId, null));
      if (!result.ok) return fail(result.error);
      if (result.undo === null) return;

      const undo = result.undo;
      toast(SHOW_STATUS_MESSAGES.removed(showName), {
        id: toastId,
        description: undefined,
        duration: UNDO_TOAST_MS,
        action: {
          label: UNDO_ACTION_LABEL,
          onClick: (event) => restore(event, undo),
        },
      });
    });
  }

  /**
   * Sonner deletes a toast once its action runs, and an outcome that lands
   * during the exit animation vanishes with it (spec 0008). So the click
   * keeps the toast, takes the Undo off it so it cannot run twice, and the
   * outcome then closes it or rewrites it in place.
   */
  function restore(
    event: { preventDefault: () => void },
    undo: ShowStatusUndo,
  ) {
    event.preventDefault();
    toast(SHOW_STATUS_MESSAGES.removed(showName), {
      id: toastId,
      action: undefined,
    });
    startTransition(async () => {
      setShown({ status: undo.status, source: undo.source });
      const result = await settleStatusCall(() =>
        restoreShowStatus(showId, undo),
      );
      if (result.ok) {
        toast.dismiss(toastId);
        return;
      }
      fail(result.error);
    });
  }

  const label =
    shown === null
      ? SHOW_STATUS_MESSAGES.untracked
      : TV_STATUS_LABELS[shown.status];

  return (
    <div data-slot="show-status" className="flex flex-wrap gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`${label}, status for ${showName}`}
          className={cn(glassPillClassName(), PILL)}
        >
          <ShowStatusIcon status={shown?.status ?? null} />
          <span aria-hidden="true">{label}</span>
          <ChevronDownIcon
            aria-hidden="true"
            className="size-3.5 text-text-secondary"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent aria-label={SHOW_STATUS_MESSAGES.menuLabel}>
          <DropdownMenuRadioGroup
            value={shown?.status ?? null}
            onValueChange={(value: TvStatus) => choose(value)}
          >
            {TV_STATUSES.map((status) => (
              <DropdownMenuRadioItem key={status} value={status} closeOnClick>
                <ShowStatusIcon status={status} className="size-4" />
                {TV_STATUS_LABELS[status]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          {shown !== null ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={remove}>
                {SHOW_STATUS_MESSAGES.remove}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export { ShowStatusControl };
