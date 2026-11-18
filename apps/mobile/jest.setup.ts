// Native modules have no implementation under Jest; these are the libraries'
// own in memory stand ins.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
