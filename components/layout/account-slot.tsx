import { cn } from "cn";

import { signOutAction } from "@/app/(auth)/actions";
import { LibraryNav } from "@/components/layout/library-nav";
import { MobileMenuSheet } from "@/components/layout/mobile-menu-sheet";
import { Button, ButtonLink } from "@/components/ui/button";
import { avatarLetter, displayName } from "@/lib/auth/identity";
import { getOptionalUser } from "@/lib/auth/user";
import { publicEnvProblems } from "@/lib/env";

/**
 * The only piece of the shared layout that reads the session (spec 0005, AC-13,
 * AC-14).
 *
 * It is rendered on the server, so the navbar never paints a signed out state
 * and then corrects itself once JavaScript notices a session. That flash is
 * what a client side session read would produce, and it is why this is a Server
 * Component even though everything it renders is small.
 *
 * It is also the *only* code in the layout tree allowed to read a request
 * scoped value. `app/layout.tsx` wraps each of its two instances in a Suspense
 * boundary so the rest of the shell, and therefore `/shows` and `/movies`,
 * stays in the prerendered static shell under `cacheComponents`.
 * `app/layout.test.ts` fails if a cookie, header or Supabase client appears
 * anywhere else in that tree.
 *
 * Signed in, the two layouts differ (spec 0008, AC-14, AC-15). The desktop bar
 * shows the library links, the account button and Sign out in a row; below
 * `lg` the account button drops its visible name so the row fits at `md`. The
 * mobile bar keeps only the avatar letter and a menu button; the menu sheet
 * holds the library links, the account row and Sign out, as
 * `design/mobile-menu-open.svg` draws it. `MobileMenuSheet` is a Client
 * Component, so this Server Component passes the rendered pieces in as
 * children.
 *
 * With no valid auth configuration it renders the signed out state instead of
 * reading the session. This slot is on every page, and the catalog is public,
 * so a fresh clone with no `.env.local` must still serve `/shows` and `/movies`
 * rather than fail in the layout. The sign in page itself still fails loudly
 * when submitted, through `getPublicEnv()`.
 *
 * @param variant Which navbar layout this instance fills.
 */
async function AccountSlot({ variant }: { variant: "desktop" | "mobile" }) {
  const user = publicEnvProblems() ? null : await getOptionalUser();

  if (!user) {
    return (
      <ButtonLink size="touch" href="/sign-in" className="md:h-9 md:px-4">
        Sign in
      </ButtonLink>
    );
  }

  const name = displayName(user.email);
  const letter = avatarLetter(user.email);

  if (variant === "mobile") {
    return (
      <div className="flex items-center gap-2">
        <ButtonLink
          href="/account"
          size="icon-touch"
          variant="ghost"
          className="p-0"
        >
          <Avatar letter={letter} className="size-9" />
          <span className="sr-only">{name}</span>
        </ButtonLink>

        <MobileMenuSheet>
          <LibraryNav variant="sheet" />

          <div className="flex items-center gap-3">
            <ButtonLink
              size="touch"
              href="/account"
              className="min-w-0 flex-1 justify-start gap-3 pl-1.5"
            >
              <Avatar letter={letter} className="size-8" />
              <span className="truncate">{name}</span>
            </ButtonLink>

            <form action={signOutAction}>
              <Button type="submit" size="touch">
                Sign out
              </Button>
            </form>
          </div>
        </MobileMenuSheet>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-between gap-4">
      <LibraryNav variant="bar" />

      <div className="flex items-center gap-2">
        {/*
         * Between `md` and `lg` the row has no room for the name beside the
         * library links and the tabs, so the button shrinks to its avatar and
         * the name stays as its accessible label.
         */}
        <ButtonLink
          size="touch"
          href="/account"
          className="h-9 gap-2.5 px-1 lg:pr-5"
        >
          <Avatar letter={letter} className="size-7" />
          <span className="sr-only max-w-[12ch] truncate lg:not-sr-only">
            {name}
          </span>
        </ButtonLink>

        <form action={signOutAction}>
          <Button type="submit" size="touch" className="h-9 px-4">
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}

/** The avatar letter on the brighter selected glass, from both artboards. */
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

export { AccountSlot };
