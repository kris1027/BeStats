"use client";

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

/**
 * The segmented control pill from the navbar, generalised.
 *
 * Off is plain text on the enclosing glass track; on is the `selected-glass`
 * gradient with its own rim, which is exactly how the navbar draws the active
 * SHOWS tab. The stock `outline-none` and ring focus are dropped so the single
 * outline ring in `globals.css` survives (spec 0004, AC-6).
 *
 * The SHOWS and MOVIES control in the navbar does NOT use this: AC-14 requires
 * real links whose selection comes from the pathname, not a pressed toggle.
 * The mobile menu's tab preview does, in the `personal` variant, because
 * choosing there changes what the menu shows rather than the page
 * (prompts/mobile-navigation.md, decision 3).
 */
const toggleVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full font-sans whitespace-nowrap transition-[filter,color] select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "text-text-secondary hover:text-foreground data-pressed:glass-selected data-pressed:glass-rim data-pressed:text-foreground",
        // The navbar tab's personal cyan, for the mobile menu's tab preview.
        personal:
          "text-text-secondary hover:text-foreground data-pressed:glass-selected-personal data-pressed:glass-rim data-pressed:text-text-on-personal",
      },
      size: {
        sm: "h-8 px-4 text-xs font-semibold tracking-[0.07em]",
        default: "h-10 px-5 text-[13px] font-semibold tracking-[0.07em]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Toggle({
  className,
  variant,
  size,
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
