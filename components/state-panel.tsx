import { cn } from "cn";
import { InboxIcon, TriangleAlertIcon, UserRoundIcon } from "lucide-react";
import type * as React from "react";

/**
 * One panel for the three states `design/` never drew: empty, error and signed
 * out (spec 0004, AC-11).
 *
 * Its look was proposed in the spec and approved rather than invented here,
 * which is what AGENTS.md section 3 requires for a screen with no reference:
 * a centred glass panel on the panel plate at the panel radius, capped at
 * 28rem, with a 32px icon in a muted circle above heading and body copy.
 *
 * `error` and `signed-out` must offer a way forward. A dead end error screen
 * with no retry is the failure this component exists to prevent, so the
 * requirement is a type error at the call site and a thrown error at render,
 * not a convention. `empty` is genuinely allowed to have no action: there is
 * nothing to retry and nothing to sign in to.
 */
type StatePanelProps = {
  title: string;
  description: string;
  className?: string;
} & (
  | { variant: "empty"; action?: React.ReactNode }
  | { variant: "error" | "signed-out"; action: React.ReactNode }
);

const ICONS = {
  empty: InboxIcon,
  error: TriangleAlertIcon,
  "signed-out": UserRoundIcon,
} as const;

function StatePanel({
  variant,
  title,
  description,
  action,
  className,
}: StatePanelProps) {
  if (variant !== "empty" && !action) {
    throw new Error(
      `StatePanel: the "${variant}" variant always needs an action, so the user is never left without a way forward (spec 0004, AC-11).`,
    );
  }

  const Icon = ICONS[variant];

  return (
    <section
      data-slot="state-panel"
      data-variant={variant}
      /*
       * `alert` for an error so assistive technology announces it as soon as it
       * appears; the other two are ordinary content that the user navigated to
       * deliberately and should not interrupt anything.
       */
      role={variant === "error" ? "alert" : undefined}
      className={cn(
        "glass glass-rim glass-plate-panel glass-shadow mx-auto flex w-full max-w-md flex-col items-center gap-4 rounded-panel px-6 py-10 text-center",
        className,
      )}
    >
      <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className="size-8 text-muted-foreground" aria-hidden="true" />
      </span>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg leading-tight font-semibold text-foreground">
          {title}
        </h2>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>

      {action ? <div className="pt-1">{action}</div> : null}
    </section>
  );
}

export { StatePanel };
