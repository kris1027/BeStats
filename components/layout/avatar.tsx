import { cn } from "cn";

/**
 * The account's avatar letter on the brighter selected glass, shared by the
 * desktop account button and the mobile menu's Account row, so both draw the
 * same mark at their own size.
 */
function Avatar({ letter, className }: { letter: string; className: string }) {
  return (
    <span
      className={cn(
        "glass-selected glass-rim flex shrink-0 items-center justify-center rounded-full text-sm font-bold text-foreground",
        className,
      )}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
}

export { Avatar };
