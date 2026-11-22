import type { Metadata } from "next";
import { AuthPanel } from "@/components/auth/auth-panel";

export const metadata: Metadata = {
  title: "Open the link on your phone",
};

/**
 * `/reset-password/app`, where a reset asked from the BeStats app lands when
 * the link opens in a browser instead (spec 0033, child 0036).
 *
 * The page never exchanges the code. The reset uses PKCE, so only the phone
 * that asked holds the proof that redeems it; trying here would only fail and
 * burn the link. It says where to open it instead. It reads nothing from the
 * request, so it prerenders, and the `(auth)` layout keeps it out of search
 * results, since its URL carries a code (prompts/mobile-deep-links.md,
 * decision 9). It links nowhere: someone who asked from the app has nothing
 * to do on the web, and while the website is off every other page answers
 * 403 (prompts/mobile-deep-links.md, amendment 3). Shown without a form per
 * AGENTS.md section 11, since a failed exchange here would burn the link.
 */
export default function AppResetPasswordPage() {
  return (
    <AuthPanel
      title="Open the link on your phone"
      description="This reset link only works in the BeStats app, on the phone where you asked for it. Open the email there and tap the link again."
    >
      {null}
    </AuthPanel>
  );
}
