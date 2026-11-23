import type { UseQueryResult } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react-native";
import { Text } from "@/components/text";

import { TrackingGate } from "./tracking-gate";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

/**
 * covers: prompts/mobile-web-parity-foundation.md, AC-5 and requirement 11:
 * the tracking controls load as skeletons, not a spinner, and the wait is
 * announced once.
 */
test("pending tracking shows hidden skeletons under one loading label", async () => {
  const state = { isPending: true } as UseQueryResult<string>;
  await render(
    <TrackingGate signedIn state={state}>
      {(data) => <Text>{data}</Text>}
    </TrackingGate>,
  );
  expect(screen.getAllByRole("progressbar")).toHaveLength(1);
  expect(screen.getByLabelText("Loading your tracking")).toBeOnTheScreen();
  const skeletons = screen.getAllByTestId("skeleton", {
    includeHiddenElements: true,
  });
  expect(skeletons).toHaveLength(2);
  for (const skeleton of skeletons) expect(skeleton).not.toBeVisible();
});
