import { render, screen } from "@testing-library/react-native";

import { LoadingState } from "./centered-state";
import { gridCardWidth } from "./grid-layout";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useCanGoBack: () => false,
}));

/**
 * covers: prompts/mobile-web-parity-foundation.md, requirement 11 and AC-5
 * (skeletons, not spinners; hidden from screen readers; the wait announced
 * once by its label)
 */

test("a loading screen announces its wait once and hides its skeletons", async () => {
  await render(<LoadingState layout="grid" label="Loading results" />);
  expect(screen.getAllByRole("progressbar")).toHaveLength(1);
  expect(screen.getByLabelText("Loading results")).toBeOnTheScreen();
  const skeletons = screen.getAllByTestId("skeleton", {
    includeHiddenElements: true,
  });
  expect(skeletons.length).toBeGreaterThan(0);
  for (const skeleton of skeletons) {
    expect(skeleton).not.toBeVisible();
  }
});

test("grid cards fill three columns inside the gutters", () => {
  // 375pt phone: 375 minus two 16pt gutters and two 12pt gaps, over three.
  expect(gridCardWidth(375)).toBe(106);
});
