"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";
import { MenuIcon, XIcon } from "lucide-react";
import type * as React from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * The expanded mobile menu from `design/mobile-menu-open.svg`: a glass sheet on
 * the sheet plate, dropping below the navbar rather than centring on screen
 * (spec 0004, AC-15).
 *
 * Every behaviour AC-15 names comes from Base UI's modal Dialog, verified
 * against the installed `@base-ui/react` 1.8.0 rather than assumed: focus moves
 * into the popup on open, is trapped while open, and returns to the trigger on
 * close; Escape dismisses; the page behind is scroll locked and hidden from
 * assistive technology. Nothing here reimplements any of it.
 *
 * The reference draws this menu only in its signed in form, and every link in
 * it is private. `AccountSlot` fills it with the library links, the account row
 * and Sign out (spec 0008, AC-15).
 *
 * Choosing a link closes the sheet as it navigates, so the next page is not
 * hidden behind it. The dialog is controlled for that one reason: a click that
 * lands on any link inside the popup closes it, whatever the link, including
 * one to the page already open. The artboard draws no title, so `Menu` is kept
 * for screen readers only, which keeps the dialog named.
 */
function MobileMenuSheet({
  children,
  triggerLabel = "Open menu",
  className,
}: {
  children: React.ReactNode;
  triggerLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        render={<Button size="icon-touch" aria-label={triggerLabel} />}
      >
        <MenuIcon className="size-5" aria-hidden="true" />
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-40 bg-background/60 duration-150 supports-backdrop-filter:backdrop-blur-glass data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />

        <DialogPrimitive.Popup
          className={cn(
            "glass glass-rim glass-plate-sheet glass-shadow fixed inset-x-4 top-4 z-50 flex max-h-[calc(100dvh-2rem)] flex-col gap-6 overflow-y-auto rounded-panel p-6 duration-150 data-open:animate-in data-open:slide-in-from-top-4 data-open:fade-in-0 data-closed:animate-out data-closed:slide-out-to-top-4 data-closed:fade-out-0",
            className,
          )}
          onClick={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest("a[href]")
            ) {
              setOpen(false);
            }
          }}
        >
          <div className="flex items-start justify-end gap-4">
            <DialogPrimitive.Title className="sr-only">
              Menu
            </DialogPrimitive.Title>

            <DialogPrimitive.Close
              render={<Button size="icon-touch" aria-label="Close menu" />}
            >
              <XIcon className="size-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>

          {children}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export { MobileMenuSheet };
