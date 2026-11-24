import { render, screen, userEvent } from "@testing-library/react-native";
import { useState } from "react";

import { PlatformPicker } from "./platform-picker";

/**
 * covers: prompts/mobile-look-search.md, decision 3 and AC-4 (the web's
 * platforms list: the filter box, hidden ticks kept, the cap, and the
 * `No platforms match` and `Platforms unavailable` copy)
 */
const PLATFORMS = [
  { id: 6, name: "PC (Microsoft Windows)" },
  { id: 130, name: "Nintendo Switch" },
  { id: 167, name: "PlayStation 5" },
];

function Harness({ max = 20 }: { max?: number }) {
  const [selected, setSelected] = useState<number[]>([]);
  return (
    <PlatformPicker
      platforms={PLATFORMS}
      selected={selected}
      max={max}
      onToggle={(id) =>
        setSelected((current) =>
          current.includes(id)
            ? current.filter((value) => value !== id)
            : [...current, id],
        )
      }
    />
  );
}

test("the filter narrows by name and a hidden tick stays ticked", async () => {
  const user = userEvent.setup();
  await render(<Harness />);
  await user.press(screen.getByRole("checkbox", { name: "Nintendo Switch" }));
  await user.type(screen.getByLabelText("Filter platforms"), "play");
  expect(
    screen.queryByRole("checkbox", { name: "Nintendo Switch" }),
  ).toBeNull();
  expect(
    screen.getByRole("checkbox", { name: "PlayStation 5" }),
  ).toBeOnTheScreen();
  await user.clear(screen.getByLabelText("Filter platforms"));
  expect(
    screen.getByRole("checkbox", { name: "Nintendo Switch" }),
  ).toBeChecked();
});

test("says so when the filter keeps none", async () => {
  const user = userEvent.setup();
  await render(<Harness />);
  await user.type(screen.getByLabelText("Filter platforms"), "amiga");
  expect(screen.getByText("No platforms match")).toBeOnTheScreen();
});

test("at the cap the unticked rows are disabled and Up to N says why", async () => {
  const user = userEvent.setup();
  await render(<Harness max={1} />);
  await user.press(screen.getByRole("checkbox", { name: "PlayStation 5" }));
  expect(screen.getByText("Up to 1")).toBeOnTheScreen();
  expect(
    screen.getByRole("checkbox", { name: "Nintendo Switch" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("checkbox", { name: "PlayStation 5" }),
  ).not.toBeDisabled();
});

test("a failed list reads Platforms unavailable, never an empty list", async () => {
  await render(
    <PlatformPicker
      platforms={null}
      selected={[]}
      max={20}
      onToggle={() => {}}
    />,
  );
  expect(screen.getByText("Platforms unavailable")).toBeOnTheScreen();
  expect(screen.queryByText("No platforms match")).toBeNull();
});
