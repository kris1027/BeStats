"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";
import { MenuIcon, XIcon } from "lucide-react";
import type * as React from "react";

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
 * it is private. So the sheet ships here as the primitive with its trigger and
 * its shell, and feature 6 fills it with the account row and the library links
 * once there is a session to read them from. It is exercised today by the
 * showcase route.
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
  return (
    <DialogPrimitive.Root>
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
        >
          <div className="flex items-start justify-between gap-4">
            <DialogPrimitive.Title className="text-lg font-bold text-foreground">
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
