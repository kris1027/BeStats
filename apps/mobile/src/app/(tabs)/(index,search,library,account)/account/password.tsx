import { ChangePasswordScreen } from "@/screens/change-password-screen";

/**
 * `/account/password`, pushed on the Account tab's stack from its Change
 * password row; a route file only, its body in `screens/`
 * (apps/mobile/AGENTS.md, Files; prompts/mobile-look-account.md, decision 3),
 * so the private screen rechecks the session itself (AGENTS.md section 11).
 */
export default function ChangePasswordRoute() {
  return <ChangePasswordScreen />;
}
