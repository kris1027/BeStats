import { cn } from "cn";
import type * as React from "react";

/**
 * The card every auth screen sits in, taken from the two sign in artboards
 * (spec 0005, AC-21).
 *
 * The references draw one card at two widths: 480px wide with a 32px radius on
 * desktop, 358px with 28px on mobile, both on the panel plate with the glass
 * gradient and the rim. That is `rounded-panel` plus `glass-plate-panel`, the
 * same combination `StatePanel` already uses, so the two read as one family.
 *
 * Only the sign in screen has a reference. The other four auth screens
 * (sign up, check email, forgot password, reset password) reuse this card, its
 * type scale and its spacing unchanged rather than inventing a second look,
 * which is what `AGENTS.md` section 3 asks for when a screen has no reference.
 */
function AuthPanel({
  title,
  description,
  children,
  footer,
  className,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex w-full flex-1 items-start justify-center py-4 md:items-center md:py-8">
      <section
        className={cn(
          "glass glass-rim glass-plate-panel glass-shadow flex w-full max-w-[480px] flex-col gap-6 rounded-panel px-5 py-8 md:px-10 md:py-10",
          className,
        )}
      >
        <header className="flex flex-col gap-2 text-center">
          <h1 className="text-3xl leading-tight font-bold tracking-[-0.03em] text-foreground md:text-4xl">
            {title}
          </h1>
          <p className="text-sm text-muted-foreground md:text-base">
            {description}
          </p>
        </header>

        {children}

        {footer ? (
          <p className="text-center text-sm text-muted-foreground">{footer}</p>
        ) : null}
      </section>
    </div>
  );
}

export { AuthPanel };
