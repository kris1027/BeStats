import { signOutAction } from "@/app/(auth)/actions";
import { Avatar } from "@/components/layout/avatar";
import { LibraryNav } from "@/components/layout/library-nav";
import { MobileAccountBlock } from "@/components/layout/mobile-account-block";
import { MobileMenuSheet } from "@/components/layout/mobile-menu-sheet";
import { Button, ButtonLink } from "@/components/ui/button";
import { avatarLetter, displayName } from "@/lib/auth/identity";
import { getOwnProfile } from "@/lib/auth/profile";
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
 * The two layouts differ (spec 0008, AC-14, AC-15). Signed in, the desktop
 * bar shows the library links, the account button and Sign out in a row;
 * below `lg` the account button drops its visible name so the row fits at
 * `md`. The mobile bar is only the menu button, signed in or out
 * (prompts/mobile-navigation.md): the full screen menu holds the search, the
 * tabs, the library rows when signed in, and the account block this slot
 * renders, the Account row and Sign out, or Sign in. `MobileMenuSheet` is a
 * Client Component, so this Server Component passes that block in already
 * rendered, and the client never decides who is signed in.
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
    if (variant === "mobile") {
      return <MobileMenuSheet account={null} />;
    }
    return (
      <ButtonLink size="bar" href="/sign-in">
        Sign in
      </ButtonLink>
    );
  }

  // The username, when the account has chosen one. A failed read falls back
  // to the email name rather than failing the slot on every page.
  const profile = await getOwnProfile();
  const name = displayName(user.email, profile?.username);
  const letter = avatarLetter(user.email, profile?.username);

  const menu = (
    <MobileMenuSheet
      hiddenFrom={variant === "mobile" ? "md" : "xl"}
      account={<MobileAccountBlock letter={letter} name={name} />}
    />
  );

  if (variant === "mobile") return menu;

  /*
   * Signed in, the full row (library links, account, Sign out) needs about
   * 1460px on a games page, so below `xl` the desktop bar keeps the tabs and
   * the search and puts the same menu button in their place
   * (prompts/mobile-navigation.md, decision 10).
   */
  return (
    <>
      <div className="flex flex-1 justify-end xl:hidden">{menu}</div>
      <div className="hidden min-w-0 flex-1 items-center justify-between gap-4 xl:flex">
        <LibraryNav variant="bar" />

        {/*
         * `ml-auto` keeps the account controls at the right edge on a page
         * about neither catalog, where the library links render nothing and
         * `justify-between` alone would leave them at the left.
         */}
        <div className="ml-auto flex items-center gap-2">
          {/*
           * Between `xl` and `2xl` the row has no room for the name beside the
           * library links and the tabs, so the button shrinks to its avatar and
           * the name stays as its accessible label.
           */}
          <ButtonLink
            size="bar"
            href="/account"
            className="gap-2.5 px-1.5 2xl:pr-5"
          >
            <Avatar letter={letter} className="size-7" />
            <span className="sr-only max-w-[12ch] truncate 2xl:not-sr-only">
              {name}
            </span>
          </ButtonLink>

          <form action={signOutAction}>
            <Button type="submit" size="bar">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}

export { AccountSlot };
