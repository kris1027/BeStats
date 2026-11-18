import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { SESSION_EXPIRED_MESSAGE, setSessionExpiredHandler } from "./api";
import { queryClient } from "./query-client";
import { getSupabase, watchAppStateForRefresh } from "./supabase";

type SessionState = {
  session: Session | null;
  /** True until the stored session has been read once. */
  loading: boolean;
  /** A notice for the sign in screen, such as an expired session. */
  notice: string | null;
  clearNotice: () => void;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

/**
 * Who is signed in, for every screen (spec 0033, AC-11; child 0036).
 *
 * The session comes only from `supabase-js`, which reads it from the
 * encrypted store and refreshes it while the app is active. Signing out, by
 * choice or because a `me` call was refused twice, clears the query cache, so
 * no private data stays on the phone for the next person (AC-13). An expired
 * session is never silent: it leaves a notice for the sign in screen.
 */
export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

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
      (_event, next) => {
        setSession(next);
        if (!next) queryClient.clear();
      },
    );
    const stopWatching = watchAppStateForRefresh();
    setSessionExpiredHandler(async () => {
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      queryClient.clear();
      setNotice(SESSION_EXPIRED_MESSAGE);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
      stopWatching();
    };
  }, []);

  const signOut = useCallback(async () => {
    await getSupabase()
      .auth.signOut()
      .catch(() => getSupabase().auth.signOut({ scope: "local" }));
    queryClient.clear();
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);

  const value = useMemo(
    () => ({ session, loading, notice, clearNotice, signOut }),
    [session, loading, notice, clearNotice, signOut],
  );
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

/** The current session state; only inside `SessionProvider`. */
export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}
