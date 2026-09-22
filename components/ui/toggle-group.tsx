"use client";

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import type { VariantProps } from "class-variance-authority";
import { cn } from "cn";
import * as React from "react";

import { toggleVariants } from "@/components/ui/toggle";

/**
 * The glass track that holds a row of toggles, from the navbar artboards: a
 * fully rounded glass pill on the control plate, with the items sitting inside
 * it (spec 0004, task 5).
 *
 * The stock version carried a large block of joined-edge styling for a
 * `spacing=0` segmented look that `design/` never draws; it is dropped. The
 * track keeps its own padding so the selected item's rim never touches the
 * track's rim, which is how every reference draws it.
 */
const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants>
>({});

function ToggleGroup({
  className,
  variant,
  size,
  children,
  ...props
}: ToggleGroupPrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      className={cn(
        "glass glass-rim glass-plate glass-shadow flex w-fit items-center gap-1 rounded-full p-1.5",
        className,
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  );
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext);

  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      className={cn(
        toggleVariants({
          variant: context.variant ?? variant,
          size: context.size ?? size,
        }),
        className,
      )}
      {...props}
    >
      {children}
    </TogglePrimitive>
  );
}

export { ToggleGroup, ToggleGroupItem };
