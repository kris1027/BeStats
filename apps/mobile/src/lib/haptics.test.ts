import * as Haptics from "expo-haptics";
import { confirmedWriteHaptic, refusedWriteHaptic } from "./haptics";

jest.mock("expo-haptics", () => ({
  ...jest.requireActual("expo-haptics"),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
}));

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

/**
 * covers: prompts/mobile-web-parity-foundation.md, decision 10 and AC-6 (a
 * medium tap on a confirmed write, since on a real iPhone the light one
 * could not be felt while the error buzz could, 2026-11-24; the error buzz
 * on a refused one; a failed haptic never breaks the write and is named in
 * Metro by a development build)
 */
describe("haptics", () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it("taps once at medium strength on a confirmed write", () => {
    confirmedWriteHaptic();
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledWith(
      Haptics.ImpactFeedbackStyle.Medium,
    );
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it("buzzes the error notification once on a refused write", () => {
    refusedWriteHaptic();
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Error,
    );
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  it("catches a failed haptic and names it in a development build", async () => {
    const error = new Error("no haptics engine");
    jest.mocked(Haptics.impactAsync).mockRejectedValueOnce(error);
    jest.mocked(Haptics.notificationAsync).mockRejectedValueOnce(error);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    confirmedWriteHaptic();
    refusedWriteHaptic();
    await flushPromises();

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith("Haptic failed:", error);
  });
});
