import { V1_ERROR_MESSAGES } from "@bestats/core/api/v1/errors";
import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { setSessionExpiredHandler } from "./api";
import { clearPrivateQueries } from "./query-client";
import {
  getSupabase,
  signOutLocally,
  watchAppStateForRefresh,
} from "./supabase";

type SessionState = {
  session: Session | null;
  /** True until the stored session has been read once. */
  loading: boolean;
  /** A notice for the sign in screen, such as an expired session. */
  notice: string | null;
  clearNotice: () => void;
  signOut: () => Promise<void>;
  /**
   * Ends the session on this phone only, after the account was deleted:
   * the auth user is gone, so there is nothing to revoke on the server.
   */
  endLocalSession: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

/**
 * Who is signed in, for every screen (spec 0033, AC-11; child 0036).
 *
 * The session comes only from `supabase-js`, which reads it from the
 * encrypted store and refreshes it while the app is active. Signing out, by
 * choice or because a `me` call was refused twice, wipes the private part of
 * the query cache (`clearPrivateQueries`), so no private data stays on the
 * phone for the next person (AC-13). An expired
 * session is never silent: it leaves a notice for the sign in screen, also
 * when supabase-js ends it by itself (a refused background refresh after the
 * account was deleted, the password reset or a global sign out elsewhere),
 * since the API then never answers 401 (AGENTS.md section 11).
 */
export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  // How many sign outs this app has under way on purpose, so their own
  // SIGNED_OUT events are not taken for a session supabase-js ended. A
  // count, not a flag: a 401 sign out finishing during a chosen one must
  // not lift the guard the chosen one still needs.
  const signingOut = useRef(0);

  const signOutQuietly = useCallback(async (run: () => Promise<void>) => {
    signingOut.current += 1;
    try {
      await run();
    } finally {
      signingOut.current -= 1;
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabase();
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setSession(data.session);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, next) => {
        setSession(next);
        if (!next) void clearPrivateQueries();
        if (event === "SIGNED_OUT" && signingOut.current === 0) {
          setNotice(V1_ERROR_MESSAGES.unauthenticated);
        }
      },
    );
    const stopWatching = watchAppStateForRefresh();
    setSessionExpiredHandler(async () => {
      // The library may refuse the sign out and send no event, so the
      // signed out state is set here, not left to the listener.
      await signOutQuietly(signOutLocally);
      setSession(null);
      void clearPrivateQueries();
      setNotice(V1_ERROR_MESSAGES.unauthenticated);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
      stopWatching();
    };
  }, [signOutQuietly]);

  const signOut = useCallback(async () => {
    // Global, said out loud like the web's action: a password reset relies
    // on it to end every other session. A refused global sign out returns
    // its error rather than throwing, so both outcomes fall back to the
    // local one.
    await signOutQuietly(async () => {
      const { error } = await getSupabase()
        .auth.signOut({ scope: "global" })
        .catch((caught: unknown) => ({ error: caught }));
      if (error) await signOutLocally();
    });
    setSession(null);
    void clearPrivateQueries();
  }, [signOutQuietly]);

  const endLocalSession = useCallback(async () => {
    await signOutQuietly(signOutLocally);
    setSession(null);
    void clearPrivateQueries();
  }, [signOutQuietly]);

  const clearNotice = useCallback(() => setNotice(null), []);

  const value = useMemo(
    () => ({
      session,
      loading,
      notice,
      clearNotice,
      signOut,
      endLocalSession,
    }),
    [session, loading, notice, clearNotice, signOut, endLocalSession],
  );
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

/**
 * Runs once the persisted query cache is back from disk: with no stored
 * session, every private entry it brought back is wiped at once (spec 0033,
 * AC-13). That covers a session that ended while the app was not running to
 * wipe, so a signed out phone never shows someone's library (AGENTS.md
 * section 11: private data stays private to its owner).
 */
export async function wipePrivateCacheIfSignedOut(): Promise<void> {
  const { data } = await getSupabase()
    .auth.getSession()
    .catch(() => ({ data: { session: null } }));
  if (!data.session) await clearPrivateQueries();
}

/**
 * The current session state; only inside `SessionProvider`. Screens read the
 * signed in state from here rather than from the client, so a sign out from a
 * second 401 shows its notice everywhere at once (AGENTS.md section 11: an
 * expired session shows visibly).
 */
export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}
