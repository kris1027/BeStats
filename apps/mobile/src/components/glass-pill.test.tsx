import { render, screen } from "@testing-library/react-native";

import {
  CalculatedRatingBadge,
  CommunityRatingBadge,
  GlassPill,
  PersonalScoreBadge,
} from "./glass-pill";

/**
 * covers: prompts/mobile-web-parity-foundation.md, requirement 6 and AC-4
 * (a community rating names its source; absent is not zero; the personal
 * and calculated ratings read the web's own formatting)
 */

test("a community rating names its catalog for screen readers", async () => {
  await render(
    <>
      <CommunityRatingBadge source="TMDB" value={7.44} />
      <CommunityRatingBadge source="IGDB" value={81} />
    </>,
  );
  expect(screen.getByLabelText("TMDB rating 7.4")).toBeOnTheScreen();
  expect(screen.getByLabelText("IGDB community rating 81.0")).toBeOnTheScreen();
});

test("no community rating draws no pill, never a zero", async () => {
  await render(<CommunityRatingBadge source="TMDB" value={null} />);
  expect(screen.queryByText(/0/)).toBeNull();
  expect(screen.queryByLabelText(/TMDB/)).toBeNull();
});

test("the personal score reads Not rated until the user scores it", async () => {
  await render(
    <>
      <PersonalScoreBadge value={null} />
      <PersonalScoreBadge value={8} />
    </>,
  );
  expect(screen.getByLabelText("Your score Not rated")).toBeOnTheScreen();
  expect(screen.getByLabelText("Your score 8")).toBeOnTheScreen();
});

test("a calculated rating keeps one decimal and its label", async () => {
  await render(<CalculatedRatingBadge value={7} label="Season rating" />);
  expect(screen.getByLabelText("Season rating 7.0")).toBeOnTheScreen();
  expect(screen.getByText("7.0")).toBeOnTheScreen();
});

/** covers: prompts/mobile-date-pill-visible.md, decision 3 */
test("only a date pill shrinks its text to fit", async () => {
  await render(
    <>
      <GlassPill fitDate>Feb 23, 2027</GlassPill>
      <GlassPill>Playing</GlassPill>
    </>,
  );
  expect(screen.getByText("Feb 23, 2027").props).toMatchObject({
    adjustsFontSizeToFit: true,
    minimumFontScale: 0.8,
  });
  expect(screen.getByText("Playing").props.adjustsFontSizeToFit).toBe(false);
});
