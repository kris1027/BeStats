import { signOutAction } from "@/app/(auth)/actions";
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
 * scoped value. `app/layout.tsx` wraps it in a Suspense boundary so the rest of
 * the shell, and therefore `/shows` and `/movies`, stays in the prerendered
 * static shell under `cacheComponents`. `app/layout.test.ts` fails if a cookie,
 * header or Supabase client appears anywhere else in that tree.
 *
 * `MobileMenuSheet` is a Client Component, so it cannot import this directly;
 * the layout passes the rendered output in as children instead.
 *
 * With no valid auth configuration it renders the signed out state instead of
 * reading the session. This slot is on every page, and the catalog is public,
 * so a fresh clone with no `.env.local` must still serve `/shows` and `/movies`
 * rather than fail in the layout. The sign in page itself still fails loudly
 * when submitted, through `getPublicEnv()`.
 */
async function AccountSlot() {
  const user = publicEnvProblems() ? null : await getOptionalUser();

  if (!user) {
    return (
      <ButtonLink size="touch" href="/sign-in" className="md:h-9 md:px-4">
        Sign in
      </ButtonLink>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <ButtonLink
        size="touch"
        href="/account"
        className="gap-2.5 pl-1.5 md:h-9 md:pl-1"
      >
        <span
          className="glass-selected glass-rim flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-foreground md:size-7"
          aria-hidden="true"
        >
          {avatarLetter(user.email)}
        </span>
        {/*
         * The mobile artboard draws only the letter. With the name beside it a
         * long address pushed Sign out past a 390px viewport, so below `md`
         * the name is kept for screen readers only, which also keeps the link
         * from being named by nothing but an aria-hidden letter.
         */}
        <span className="sr-only md:not-sr-only md:max-w-[12ch] md:truncate">
          {displayName(user.email)}
        </span>
      </ButtonLink>

      <form action={signOutAction}>
        <Button type="submit" size="touch" className="md:h-9 md:px-4">
          Sign out
        </Button>
      </form>
    </div>
  );
}

export { AccountSlot };
