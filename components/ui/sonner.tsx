"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * The toast region, restyled onto the sheet plate (spec 0007, Toasts).
 *
 * Generated with the shadcn CLI, then cut back. The stock file reads the theme
 * from `next-themes`, which this app does not install: there is one dark theme
 * and no `.dark` class (spec 0004), so the theme is fixed instead of adding a
 * dependency whose only job would be to return the same answer.
 *
 * `unstyled` drops Sonner's own look, so the toast wears the same plate, glass,
 * rim and panel radius as the dialog rather than a second visual language, and
 * no colour literal is written outside `globals.css`. Toasts only ever report
 * a failed save; success is shown by the control that was clicked.
 */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="bottom-center"
      className="toaster"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "glass glass-rim glass-plate-sheet glass-shadow flex w-[calc(100vw-2rem)] items-center gap-3 rounded-panel px-4 py-3 text-sm text-foreground sm:w-(--width)",
          title: "flex-1 font-medium",
          actionButton:
            "glass glass-rim glass-plate inline-flex h-11 shrink-0 cursor-pointer items-center rounded-full px-4 text-[13px] font-bold text-foreground hover:brightness-125 md:h-9",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
