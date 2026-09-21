"use client";

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

/**
 * The segmented control pill from the navbar artboards, generalised.
 *
 * Off is plain text on the enclosing glass track; on is the `selected-glass`
 * gradient with its own rim, which is exactly how `design/` draws the active
 * SHOWS tab. The stock `outline-none` and ring focus are dropped so the single
 * outline ring in `globals.css` survives (spec 0004, AC-6).
 *
 * The SHOWS and MOVIES control in the navbar does NOT use this: AC-14 requires
 * real links whose selection comes from the pathname, not a pressed toggle.
 * This ships for the filter controls later features need.
 */
const toggleVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full font-sans whitespace-nowrap transition-[filter,color] select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "text-text-secondary hover:text-foreground data-pressed:glass-selected data-pressed:glass-rim data-pressed:text-foreground",
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
