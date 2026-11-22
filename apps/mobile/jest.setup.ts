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
jest.mock("react-native-worklets", () => ({
  scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) =>
    fn(...args),
}));
