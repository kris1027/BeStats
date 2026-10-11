import type { Metadata } from "next";

import { signOutAction } from "@/app/(auth)/actions";
import { Button, ButtonLink } from "@/components/ui/button";
import { hasPasswordIdentity } from "@/lib/auth/identity";
import { ACCOUNT_NOTICE, ACCOUNT_NOTICES } from "@/lib/auth/messages";
import { getOwnProfile } from "@/lib/auth/profile";
import { requireUser } from "@/lib/auth/user";
import { isUsernameLocked, usernameUnlocksAt } from "@/lib/auth/username";
import { createClient } from "@/lib/supabase/server";
import { ChangePasswordForm } from "./change-password-form";
import { ChangeUsernameForm } from "./change-username-form";

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
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const user = await requireUser();
  const profile = await getOwnProfile();
  const { notice } = await searchParams;

  // Only a known key shows anything, so the URL cannot put its own text here.
  const noticeText =
    notice === ACCOUNT_NOTICE.usernameTaken
      ? ACCOUNT_NOTICES[ACCOUNT_NOTICE.usernameTaken]
      : null;

  // Read once per request; the page is dynamic (`instant = false`).
  const unlocksAt =
    profile && isUsernameLocked(profile.usernameChangedAt, new Date())
      ? usernameUnlocksAt(profile.usernameChangedAt).toISOString()
      : null;

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
            {profile ? (
              <>
                <span className="font-semibold text-foreground">
                  {profile.username}
                </span>{" "}
                ({user.email})
              </>
            ) : (
              <span className="font-semibold text-foreground">
                {user.email}
              </span>
            )}
            .
          </p>
        </header>

        <form action={signOutAction}>
          <Button type="submit" size="touch">
            Sign out
          </Button>
        </form>
      </section>

      <section className="glass glass-rim glass-plate-panel glass-shadow flex flex-col gap-6 rounded-panel px-5 py-8 md:px-10 md:py-10">
        <header className="flex flex-col gap-2">
          <h2 className="text-xl leading-tight font-bold text-foreground">
            Username
          </h2>
          <p className="text-sm text-muted-foreground">
            {profile
              ? "You can change your username once a week."
              : "Choose a username. You can change it once a week."}
          </p>
        </header>

        {noticeText && !profile ? (
          <p role="status" className="text-sm text-foreground">
            {noticeText}
          </p>
        ) : null}

        <ChangeUsernameForm
          username={profile?.username ?? null}
          unlocksAt={unlocksAt}
        />
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
