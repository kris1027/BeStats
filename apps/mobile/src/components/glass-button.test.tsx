import { render } from "@testing-library/react-native";

import { GlassButton } from "./glass-button";

const mockRimTones: (string | undefined)[] = [];
jest.mock("./glass/rim", () => ({
  ...jest.requireActual("./glass/rim"),
  Rim: (props: { tone?: string }) => {
    mockRimTones.push(props.tone);
    return null;
  },
}));

beforeEach(() => {
  mockRimTones.length = 0;
});

/**
 * covers: prompts/mobile-web-parity-foundation.md, AC-4: the personal score
 * trigger draws the cyan score rim, as the web's
 * `glassPillClassName("score")`; any other button keeps the plain rim.
 */
test("a score button draws the score rim", async () => {
  await render(<GlassButton label="8" score onPress={() => {}} />);
  expect(mockRimTones.at(-1)).toBe("score");
});

test("a plain button keeps the default rim", async () => {
  await render(<GlassButton label="Plan" onPress={() => {}} />);
  expect(mockRimTones.at(-1)).toBe("default");
});
