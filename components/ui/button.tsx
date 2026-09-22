import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import Link from "next/link";
import type * as React from "react";

/**
 * The button shapes `design/` actually draws (spec 0004, task 5).
 *
 * Generated with the shadcn CLI and then stripped back rather than restyled on
 * top: the stock variants carry `dark:` pairs that no longer resolve (there is
 * no `.dark` class any more, AC-1) and a `focus-visible:ring` treatment that
 * would fight the single outline ring in `globals.css`. Most importantly the
 * stock base class sets `outline-none`, which wins against the `@layer base`
 * rule and would silently delete the focus ring AC-6 requires. None of that is
 * kept.
 *
 * Every filled variant is a glass pill: plate, then the glass gradient, then
 * the rim. The plate is not optional on anything that can land over artwork
 * (AC-5), so it is baked into the variant rather than left to the caller.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 font-sans whitespace-nowrap transition-[filter,opacity] select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** The default control: the navbar Sign in button and its kin. */
        glass:
          "glass glass-rim glass-plate glass-shadow text-foreground hover:brightness-125",
        /** The active or committed control: the sign in page submit button. */
        selected:
          "glass-selected glass-rim glass-plate glass-shadow text-foreground hover:brightness-110",
        ghost: "text-text-secondary hover:text-foreground",
        link: "text-text-link underline-offset-4 hover:text-foreground hover:underline",
        destructive:
          "glass glass-rim glass-plate text-destructive hover:brightness-125",
      },
      size: {
        /*
         * Heights split from the references for touch. The mobile artboards
         * draw a 35px control, which is below the 44px touch target
         * AGENTS.md section 3 asks for, so `touch` exists for the mobile
         * shell and `sm` for the pointer sized desktop one.
         */
        sm: "h-9 rounded-full px-4 text-[13px] font-bold",
        touch: "h-11 rounded-full px-5 text-sm font-bold",
        lg: "h-14 rounded-full px-6 text-lg font-bold",
        icon: "size-9 rounded-full",
        "icon-touch": "size-11 rounded-full",
      },
    },
    defaultVariants: {
      variant: "glass",
      size: "sm",
    },
  },
);

function Button({
  className,
  variant,
  size,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

/**
 * A link wearing a button's clothes.
 *
 * Base UI's Button warns, correctly, when it is rendered as something other
 * than a native `<button>`: doing so drops real button semantics. But Sign in,
 * Browse movies and the state panel's actions all navigate, and the right
 * element for navigating is an anchor. So the shared thing between them is the
 * `buttonVariants` class list, not the Button component, and this applies it to
 * a real `next/link` (ui-guide Phase 1: never fake one primitive with another).
 */
function ButtonLink({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof Link> & VariantProps<typeof buttonVariants>) {
  return (
    <Link
      data-slot="button-link"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, ButtonLink, buttonVariants };
