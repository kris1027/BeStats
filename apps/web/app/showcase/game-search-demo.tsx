"use client";

import { useState } from "react";

import { PlatformList, PlatformPicker } from "@/components/search/filter-bar";
import type { CatalogRef } from "@/lib/search/params";

const PLATFORMS: CatalogRef[] = [
  { id: 6, name: "PC (Microsoft Windows)" },
  { id: 130, name: "Nintendo Switch" },
  { id: 508, name: "Nintendo Switch 2" },
  { id: 167, name: "PlayStation 5" },
  { id: 169, name: "Xbox Series X|S" },
];

/** The open popover's look, so the list reads as it does in the bar. */
const PANEL =
  "glass glass-rim glass-plate-float glass-shadow w-[min(26rem,calc(100vw-2rem))] rounded-panel p-4 text-sm text-foreground";

/** One open platform list, its filter already typed. */
function OpenList({ initial }: { initial: string }) {
  const [filter, setFilter] = useState(initial);
  const [selected, setSelected] = useState([6]);
  return (
    <div className={PANEL}>
      <PlatformList
        platforms={PLATFORMS}
        selected={selected}
        filter={filter}
        onFilter={setFilter}
        onToggle={(id) =>
          setSelected((ids) =>
            ids.includes(id)
              ? ids.filter((value) => value !== id)
              : [...ids, id],
          )
        }
      />
    </div>
  );
}

/**
 * The games platform picker's states (spec 0029, AC-21), for `/showcase`: open
 * with a filter typed (PC stays ticked though the filter hides it), with a
 * filter that matches nothing, and disabled when IGDB's list failed. A client
 * module because the list takes handlers.
 */
export function GameSearchDemo() {
  return (
    <div className="flex flex-wrap items-start gap-6">
      <OpenList initial="switch" />
      <OpenList initial="zzz" />
      <PlatformPicker platforms={null} selected={[]} onToggle={() => {}} />
    </div>
  );
}
