import type { Metadata } from "next";

import { signOutAction } from "@/app/(auth)/actions";
import { Button, ButtonLink } from "@/components/ui/button";
import { hasPasswordIdentity } from "@/lib/auth/identity";
import { requireUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";
import { ChangePasswordForm } from "./change-password-form";

/**
 * This route opts out of prerendering (root `AGENTS.md`, `cacheComponents`).
 *
 * Everything on the page is the session: who you are, and whether you have a
 * password to change. There is no shell worth prerendering, and the redirect
 * for a signed out visitor has to happen before anything renders, not stream in
 * behind a boundary. A Suspense boundary here would buy a card outline at the
 * cost of hiding that redirect behind a flash of empty chrome.
 *
 * This is the opt out the project reserves for exactly this case. The public
 * catalog routes stay prerendered, which is what AC-14 is about.
 */
export const instant = false;

export const metadata: Metadata = {
  title: "Account",
  // Private, so it must not be indexed, for the same reason the auth screens
  // are not (spec 0005, AC-20).
  robots: { index: false, follow: false },
};

/**
 * `/account`, the first private route in the app (spec 0005, AC-12, AC-16).
 *
 * `requireUser()` is what makes it private, not the proxy. The proxy redirect
 * is convenience and can be bypassed; this call verifies the session itself and
 * redirects with the current path attached when there is none. Every private
 * page from feature 9 onwards must do the same (`AGENTS.md` section 11).
 *
 * No reference exists for this screen. It reuses `AuthPanel`'s card, type scale
 * and spacing unchanged rather than inventing a second look, which is the
 * approach `AGENTS.md` section 3 asks for and spec 0005 records.
 */
export default async function AccountPage() {
  const user = await requireUser();

  // The one network call on this page. `getClaims()` has already established
  // who this is, but the identities list is not in the JWT and AC-16 needs it.
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  // A failed lookup is not evidence of a provider only account. Hiding the
  // form on that basis would quietly take the control away from an email
  // user, so the failure gets its own state with a way to try again.
  const identitiesUnavailable = Boolean(error) || !data.user;

  // A provider only account (Google, from feature 20) carries no `email`
  // identity and therefore has no password to change. That account cannot exist
  // yet, so this branch is covered by a unit test over the condition rather than
  // a browser step (AC-16).
  const canChangePassword =
    !identitiesUnavailable && hasPasswordIdentity(data.user?.identities);

  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col gap-6 py-4 md:py-8">
      <section className="glass glass-rim glass-plate-panel glass-shadow flex flex-col gap-6 rounded-panel px-5 py-8 md:px-10 md:py-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl leading-tight font-bold tracking-[-0.03em] text-foreground md:text-4xl">
            Account
          </h1>
          <p className="text-sm text-muted-foreground md:text-base">
            You are signed in as{" "}
            <span className="font-semibold text-foreground">{user.email}</span>.
          </p>
        </header>

        <form action={signOutAction}>
          <Button type="submit" size="touch">
            Sign out
          </Button>
        </form>
      </section>

      {canChangePassword ? (
        <section className="glass glass-rim glass-plate-panel glass-shadow flex flex-col gap-6 rounded-panel px-5 py-8 md:px-10 md:py-10">
          <header className="flex flex-col gap-2">
            <h2 className="text-xl leading-tight font-bold text-foreground">
              Change password
            </h2>
            <p className="text-sm text-muted-foreground">
              Your new password needs at least 8 characters.
            </p>
          </header>

          <ChangePasswordForm />
        </section>
      ) : null}

      {identitiesUnavailable ? (
        <section className="glass glass-rim glass-plate-panel glass-shadow flex flex-col gap-4 rounded-panel px-5 py-8 md:px-10 md:py-10">
          <p
            role="alert"
            className="text-sm text-muted-foreground md:text-base"
          >
            We could not load your password settings. Please try again.
          </p>
          <ButtonLink size="touch" href="/account" className="self-start">
            Try again
          </ButtonLink>
        </section>
      ) : null}
    </div>
  );
}
