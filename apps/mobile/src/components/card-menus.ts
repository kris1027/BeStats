import type {
  V1GameTitleState,
  V1MovieTitleState,
  V1ShowTitleState,
} from "@bestats/core/api/v1/titles";

import {
  gameCardMenu,
  movieCardMenu,
  showCardMenu,
} from "@/lib/catalog-card-actions";
import {
  useGameWrite,
  useMovieWrite,
  useShowTrackingWrite,
} from "@/lib/title-writes";

import { type MenuEntry, wire } from "./card-link";

/**
 * A movie card's long press menu, bound to the title screen's write. The
 * catalog and library cards both read it, so a type's write and menu are
 * paired once (apps/mobile/AGENTS.md, Catalog card actions; AGENTS.md
 * section 7, planned or watched). Undefined until the user's state is known,
 * so a card never offers an action it cannot draw honestly.
 */
export function useMovieCardMenu(
  id: number,
  state: V1MovieTitleState | undefined,
  releaseDate: string | null,
  today: string,
): MenuEntry[] | undefined {
  const write = useMovieWrite(id);
  return state && wire(movieCardMenu(state, releaseDate, today), write.mutate);
}

/**
 * A show card's menu, Track or Stop tracking. Stopping keeps every mark and
 * rating (AGENTS.md section 7), so the menu has no release gate and needs no
 * day. Shared by both cards (apps/mobile/AGENTS.md, Catalog card actions).
 */
export function useShowCardMenu(
  id: number,
  name: string,
  state: V1ShowTitleState | undefined,
): MenuEntry[] | undefined {
  const toggle = useShowTrackingWrite(id, name);
  return state && wire(showCardMenu(state), toggle.mutate);
}

/**
 * A game card's menu, its statuses behind core's release gate (AGENTS.md
 * section 7). Shared by both cards (apps/mobile/AGENTS.md, Catalog card
 * actions).
 */
export function useGameCardMenu(
  id: number,
  state: V1GameTitleState | undefined,
  releaseDate: string | null,
  today: string,
): MenuEntry[] | undefined {
  const write = useGameWrite(id);
  return state && wire(gameCardMenu(state, releaseDate, today), write.mutate);
}
