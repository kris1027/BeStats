import { DeleteAccountScreen } from "@/screens/delete-account-screen";

/**
 * `/account/delete`, pushed on the Account tab's stack from its Delete row; a
 * route file only, its body in `screens/` (apps/mobile/AGENTS.md, Files), so
 * the store's deletion requirement has one screen (AGENTS.md section 1).
 */
export default function DeleteAccountRoute() {
  return <DeleteAccountScreen />;
}
