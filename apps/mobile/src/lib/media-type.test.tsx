/**
 * covers: prompts/mobile-app-shell-catalog.md, decision 3. Home and Search
 * share one media type that starts on Shows.
 */
import { act, renderHook } from "@testing-library/react-native";

import { MediaTypeProvider, useMediaType } from "./media-type";

test("starts on Shows, as the web's / opens /shows", async () => {
  const { result } = await renderHook(() => useMediaType(), {
    wrapper: MediaTypeProvider,
  });
  expect(result.current.mediaType).toBe("tv");
});

test("a switch is seen by every reader under the provider", async () => {
  const { result } = await renderHook(
    () => ({ home: useMediaType(), search: useMediaType() }),
    { wrapper: MediaTypeProvider },
  );
  await act(async () => result.current.home.setMediaType("game"));
  expect(result.current.search.mediaType).toBe("game");
});

test("outside the provider it throws rather than inventing a type", async () => {
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  await expect(renderHook(() => useMediaType())).rejects.toThrow(
    "useMediaType needs a MediaTypeProvider",
  );
  spy.mockRestore();
});
