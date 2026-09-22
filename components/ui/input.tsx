import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "cn";
import type * as React from "react";

/**
 * The field shape from `design/desktop-sign-in-page.svg`, one of the two
 * artboards at true CSS scale: 56px tall, 16px radius, glass fill with the rim.
 *
 * No plate: fields only ever sit inside a panel that already painted one, so
 * adding a second would flatten the surface the reference shows through. The
 * stock shadcn `outline-none` and `focus-visible:ring` are dropped so the one
 * focus outline in `globals.css` applies here too (spec 0004, AC-6).
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "glass glass-rim h-14 w-full min-w-0 rounded-2xl px-4 text-base text-foreground transition-[filter]",
        "placeholder:text-muted-foreground",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:text-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
