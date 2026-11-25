import { ICON_KEY_ENTRIES } from "@bestats/core/catalog/icon-key";
import {
  TMDB_APP_ATTRIBUTION,
  TMDB_ATTRIBUTION,
} from "@bestats/core/legal/attribution";
import {
  CREDIT_LINE_PREFIX,
  IGDB_ATTRIBUTION,
  IGDB_HOME_URL,
  OPERATOR_GITHUB_URL,
  OPERATOR_HANDLE,
  PRIVACY_PATH,
  TERMS_PATH,
  TMDB_HOME_URL,
} from "@bestats/core/legal/operator";
import { render, screen, userEvent } from "@testing-library/react-native";
import * as Linking from "expo-linking";

import { appVersion } from "@/lib/api";
import { OPEN_LINK_FAILED } from "@/lib/open-link";
import { testQueryClient, titleWrapper } from "@/test-utils/title-harness";

import { AboutScreen } from "./about-screen";

/**
 * covers: spec 0033, AC-14 (About shows both attributions and both logos,
 * each logo opening its site)
 */
jest.mock("expo-linking", () => ({ openURL: jest.fn() }));
jest.mock("@/lib/env", () => ({
  getPublicEnv: () => ({ EXPO_PUBLIC_API_BASE_URL: "https://api.test" }),
}));

test("credits TMDB and IGDB with their logos and the app's wording", async () => {
  await render(<AboutScreen />, { wrapper: titleWrapper(testQueryClient()) });
  expect(screen.getByText("BeStats")).toBeOnTheScreen();
  expect(screen.getByText(`Version ${appVersion()}`)).toBeOnTheScreen();
  expect(screen.getByText(TMDB_APP_ATTRIBUTION)).toBeOnTheScreen();
  expect(screen.queryByText(TMDB_ATTRIBUTION)).toBeNull();
  expect(screen.getByText(IGDB_ATTRIBUTION)).toBeOnTheScreen();

  const user = userEvent.setup();
  await user.press(screen.getByRole("link", { name: "TMDB" }));
  await user.press(screen.getByRole("link", { name: "IGDB" }));
  expect(Linking.openURL).toHaveBeenNthCalledWith(1, TMDB_HOME_URL);
  expect(Linking.openURL).toHaveBeenNthCalledWith(2, IGDB_HOME_URL);
});

test("links the Privacy Policy and Terms of Service on the API's origin", async () => {
  await render(<AboutScreen />, { wrapper: titleWrapper(testQueryClient()) });
  const user = userEvent.setup();
  await user.press(screen.getByRole("link", { name: "Privacy Policy" }));
  await user.press(screen.getByRole("link", { name: "Terms of Service" }));
  expect(Linking.openURL).toHaveBeenCalledWith(
    `https://api.test${PRIVACY_PATH}`,
  );
  expect(Linking.openURL).toHaveBeenLastCalledWith(
    `https://api.test${TERMS_PATH}`,
  );
});

/**
 * covers: prompts/mobile-about-legal-links.md, decision 4 (each link's hint
 * names its page, and says browser rather than one platform's)
 */
test("hints name the page each legal link opens", async () => {
  await render(<AboutScreen />, { wrapper: titleWrapper(testQueryClient()) });
  expect(
    screen.getByRole("link", { name: "Privacy Policy" }).props
      .accessibilityHint,
  ).toBe("Opens the Privacy Policy in your browser");
  expect(
    screen.getByRole("link", { name: "Terms of Service" }).props
      .accessibilityHint,
  ).toBe("Opens the Terms of Service in your browser");
});

/**
 * covers: prompts/mobile-look-account.md, decision 9 (the web footer's icon
 * key, in core's words and order, and the credit with the handle linking to
 * the operator's GitHub profile)
 */
test("lists every card mark in the icon key, each read by its label", async () => {
  await render(<AboutScreen />, { wrapper: titleWrapper(testQueryClient()) });
  expect(screen.getByRole("header", { name: "Icon key" })).toBeOnTheScreen();
  for (const entry of ICON_KEY_ENTRIES) {
    expect(screen.getByLabelText(entry.label)).toBeOnTheScreen();
  }
});

test("credits the operator, the handle opening their GitHub profile", async () => {
  await render(<AboutScreen />, { wrapper: titleWrapper(testQueryClient()) });
  expect(
    screen.getByText(CREDIT_LINE_PREFIX, { exact: false }),
  ).toBeOnTheScreen();
  await userEvent.press(screen.getByRole("link", { name: OPERATOR_HANDLE }));
  expect(Linking.openURL).toHaveBeenLastCalledWith(OPERATOR_GITHUB_URL);
});

/** covers: prompts/mobile-look-review-fixes.md, decision 1 (no silent link) */
test("says so when the phone cannot open a link", async () => {
  jest.mocked(Linking.openURL).mockRejectedValueOnce(new Error("no handler"));
  await render(<AboutScreen />, { wrapper: titleWrapper(testQueryClient()) });
  const user = userEvent.setup();
  await user.press(screen.getByRole("link", { name: "TMDB" }));
  expect(await screen.findByText(OPEN_LINK_FAILED)).toBeOnTheScreen();
});
