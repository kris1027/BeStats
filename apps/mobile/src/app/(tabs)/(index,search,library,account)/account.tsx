import { useLocalSearchParams } from "expo-router";

import { AccountScreen } from "@/screens/account-screen";

/**
 * `/account`: the Account tab's root. `notice` carries only a known key
 * (the username lost during sign up), never text of its own, so a link can
 * never put its own words on the screen (AGENTS.md section 11).
 */
export default function AccountTab() {
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  return <AccountScreen notice={notice} />;
}
