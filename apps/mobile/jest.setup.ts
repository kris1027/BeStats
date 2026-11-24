// Native modules have no implementation under Jest; these are the libraries'
// own in memory stand ins.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("@react-native-community/netinfo", () =>
  require("@react-native-community/netinfo/jest/netinfo-mock"),
);
// Reanimated and its worklets runtime have no native side under Jest, and
// their own mocks load it anyway, so tests use a small stand in that keeps
// animation durations (src/test-utils/reanimated-mock.ts).
jest.mock("react-native-reanimated", () =>
  require("./src/test-utils/reanimated-mock"),
);
// Gesture Handler's swipe runs on Reanimated, which is stubbed above, so the
// root view is a plain view and the swipeable renders its row with its
// actions beside it, letting a test press the revealed action
// (src/components/swipe-row.tsx).
jest.mock("react-native-gesture-handler", () => {
  const { View } = require("react-native");
  return { GestureHandlerRootView: View };
});
jest.mock("react-native-gesture-handler/ReanimatedSwipeable", () => {
  const { View } = require("react-native");
  const React = require("react");
  return {
    __esModule: true,
    default: ({
      children,
      renderRightActions,
    }: {
      children: unknown;
      renderRightActions?: (...args: unknown[]) => unknown;
    }) =>
      React.createElement(
        View,
        null,
        children,
        renderRightActions?.(
          { value: 1 },
          { value: 0 },
          {
            close: () => {},
          },
        ),
      ),
  };
});
jest.mock("react-native-worklets", () => ({
  scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) =>
    fn(...args),
}));
// Expo Router's link preview and menu are native iOS views Jest does not
// have, and without them a `Link` with `Link.Menu` renders nothing. The
// stand in draws the link's trigger and leaves the menu and preview out, so
// a card's actions are tested through its screen reader actions
// (prompts/mobile-look-card-actions.md).
jest.mock("expo-router/build/link/preview/native", () => {
  const actual = jest.requireActual("expo-router/build/link/preview/native");
  const React = require("react");
  return {
    ...actual,
    NativeLinkPreview: ({ children }: { children?: unknown }) =>
      React.createElement(React.Fragment, null, children),
    NativeLinkPreviewAction: () => null,
    NativeLinkPreviewContent: () => null,
  };
});
