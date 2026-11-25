import { render, screen, userEvent } from "@testing-library/react-native";
import {
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";

import { MediaSwitchView } from "./media-switch";

/**
 * covers: prompts/mobile-media-switch-glass.md, requirements 1, 2, 4 and 7
 * (icon over label, Liquid Glass only where the phone has it, the same
 * choice handed back, tabs announced with their selected state)
 */

afterEach(() => {
  jest.mocked(isLiquidGlassAvailable).mockReturnValue(false);
  jest.mocked(isGlassEffectAPIAvailable).mockReturnValue(false);
});

test("each type is a tab with its symbol, the chosen one selected", async () => {
  await render(<MediaSwitchView value="movie" onChange={() => {}} />);
  expect(screen.getByRole("tab", { name: "Shows" })).not.toBeSelected();
  expect(screen.getByRole("tab", { name: "Movies" })).toBeSelected();
  expect(screen.getByRole("tab", { name: "Games" })).not.toBeSelected();
  for (const symbol of [
    "play.tv.fill",
    "movieclapper.fill",
    "gamecontroller.fill",
  ]) {
    expect(
      screen.getByTestId(`symbol-${symbol}`, { includeHiddenElements: true }),
    ).toBeTruthy();
  }
});

test("pressing a tab hands its type back", async () => {
  const onChange = jest.fn();
  const user = userEvent.setup();
  await render(<MediaSwitchView value="tv" onChange={onChange} />);
  await user.press(screen.getByRole("tab", { name: "Games" }));
  expect(onChange).toHaveBeenCalledWith("game");
});

test("without Liquid Glass the bar is the app's glass plate", async () => {
  await render(<MediaSwitchView value="tv" onChange={() => {}} />);
  expect(screen.queryByTestId("liquid-glass")).toBeNull();
});

test("with Liquid Glass the bar is the system glass", async () => {
  jest.mocked(isLiquidGlassAvailable).mockReturnValue(true);
  jest.mocked(isGlassEffectAPIAvailable).mockReturnValue(true);
  await render(<MediaSwitchView value="tv" onChange={() => {}} />);
  expect(screen.getByTestId("liquid-glass")).toBeOnTheScreen();
});
