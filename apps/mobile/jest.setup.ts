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
  // The media switch's drag is a pan the tests never perform; its taps are
  // the segments' own presses (src/components/media-switch.tsx).
  return {
    GestureHandlerRootView: View,
    GestureDetector: ({ children }: { children: unknown }) => children,
    usePanGesture: () => ({}),
  };
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
// Liquid Glass and system symbols are native views. Glass reports itself
// unavailable, so plates take the `GlassPlate` path unless a test says
// otherwise (`media-switch.test.tsx`), and a symbol is a plain view named
// by its SF Symbol (prompts/mobile-media-switch-glass.md).
jest.mock("expo-glass-effect", () => {
  const { View } = require("react-native");
  return {
    GlassView: View,
    GlassContainer: View,
    isLiquidGlassAvailable: jest.fn(() => false),
    isGlassEffectAPIAvailable: jest.fn(() => false),
  };
});
jest.mock("expo-symbols", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    SymbolView: ({ name, ...rest }: { name: { ios: string } }) =>
      React.createElement(View, { ...rest, testID: `symbol-${name.ios}` }),
  };
});
