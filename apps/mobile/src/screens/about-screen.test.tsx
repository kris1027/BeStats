import { TMDB_ATTRIBUTION } from "@bestats/core/legal/attribution";
import {
  IGDB_ATTRIBUTION,
  IGDB_HOME_URL,
  TMDB_HOME_URL,
} from "@bestats/core/legal/operator";
import { render, screen, userEvent } from "@testing-library/react-native";
import * as Linking from "expo-linking";

import { appVersion } from "@/lib/api";

import { AboutScreen } from "./about-screen";

/**
 * covers: spec 0033, AC-14 (About shows both attributions and both logos,
 * each logo opening its site)
 */
jest.mock("expo-linking", () => ({ openURL: jest.fn() }));

test("credits TMDB and IGDB with their logos and the web's text", async () => {
  await render(<AboutScreen />);
  expect(screen.getByText("BeStats")).toBeOnTheScreen();
  expect(screen.getByText(`Version ${appVersion()}`)).toBeOnTheScreen();
  expect(screen.getByText(TMDB_ATTRIBUTION)).toBeOnTheScreen();
  expect(screen.getByText(IGDB_ATTRIBUTION)).toBeOnTheScreen();

  const user = userEvent.setup();
  await user.press(screen.getByRole("link", { name: "TMDB" }));
  await user.press(screen.getByRole("link", { name: "IGDB" }));
  expect(Linking.openURL).toHaveBeenNthCalledWith(1, TMDB_HOME_URL);
  expect(Linking.openURL).toHaveBeenNthCalledWith(2, IGDB_HOME_URL);
});
