import { GAME_STATUS_LABELS } from "@bestats/core/tracking/messages";
import type { StartedGameStatus } from "@bestats/core/tracking/types";
import { cn } from "cn";
import { CARD_PILL, GlassPill } from "@/components/glass-pill";

/**
 * The read only Playing or Finished chip in a game card's bottom row (spec
 * 0030, AC-6, AC-11). A plain component with no `server-only` import, so the
 * catalog cards' server slot and the client library grid render the same
 * chip. It is not a button: a started game changes status on its page.
 *
 * @param status The stored status of a started game.
 */
function GameStatusChip({ status }: { status: StartedGameStatus }) {
  return (
    <GlassPill data-slot="game-status" className={cn(CARD_PILL, "ml-auto")}>
      {GAME_STATUS_LABELS[status]}
    </GlassPill>
  );
}

export { GameStatusChip };
