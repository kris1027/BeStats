"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { SearchIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { SearchType } from "@/lib/search/params";

import { QuickSearch } from "./quick-search";

/**
 * The mobile search: the round icon from `design/mobile-menu-open.svg`, which
 * opens a full screen overlay holding the same quick search (spec 0010, AC-6).
 *
 * Base UI's modal Dialog supplies what AC-6 asks of the overlay, as it does
 * for `MobileMenuSheet`: focus moves in and is trapped while open, Escape
 * closes it, and focus returns to the icon. The field is autofocused so the
 * keyboard comes up at once. The results are laid out inline, not in a
 * popup, so Escape reaches the dialog and closes it, as does the visible close
 * button. Every control is 44px.
 *
 * Choosing a result or `See all` closes the overlay as it navigates.
 */
function MobileSearchOverlay({ type }: { type: SearchType }) {
  const [open, setOpen] = useState(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        render={<Button size="icon-touch" aria-label="Search" />}
      >
        <SearchIcon className="size-5" aria-hidden="true" />
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Popup className="fixed inset-0 z-50 flex flex-col gap-4 overflow-y-auto bg-background p-4 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0">
          <div className="flex items-center justify-between gap-4">
            <DialogPrimitive.Title className="text-xl leading-none font-extrabold tracking-[-0.03em] text-foreground">
              Search
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              render={<Button size="icon-touch" aria-label="Close search" />}
            >
              <XIcon className="size-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>

          <QuickSearch
            type={type}
            variant="overlay"
            autoFocus
            onNavigate={() => setOpen(false)}
          />
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export { MobileSearchOverlay };
