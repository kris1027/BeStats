import { screen } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import type { PropsWithChildren } from "react";
import RootLayout from "@/app/_layout";
import { Text } from "@/components/text";

/**
 * covers: AGENTS.md section 11 (an expired session is never silent): a
 * notice already set when the app mounts, as after a failed session restore,
 * still opens Sign in once the root navigator is ready.
 */
jest.mock("../global.css", () => ({}));
// expo-router's test helper swaps in its own Reanimated mock, which the
// launch animation cannot run on; this test is about the notice, not it.
jest.mock("@/components/launch-overlay", () => ({
  LaunchOverlay: ({ children }: PropsWithChildren) => children,
}));
jest.mock("@/lib/session", () => ({
  SessionProvider: ({ children }: PropsWithChildren) => children,
  useSession: () => ({
    loading: false,
    notice: "Your session expired. Sign in again.",
    session: null,
  }),
}));

test("a notice present at launch opens Sign in", async () => {
  await renderRouter(
    {
      _layout: RootLayout,
      "(tabs)/index": () => <Text>Home screen</Text>,
      "sign-in": () => <Text>Sign in screen</Text>,
    },
    { initialUrl: "/" },
  );
  expect(await screen.findByText("Sign in screen")).toBeOnTheScreen();
});
