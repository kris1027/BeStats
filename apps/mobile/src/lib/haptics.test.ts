import * as Haptics from "expo-haptics";
import { confirmedWriteHaptic, refusedWriteHaptic } from "./haptics";

jest.mock("expo-haptics", () => ({
  ...jest.requireActual("expo-haptics"),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
}));

/**
 * On a real iPhone the light impact could not be felt while the error buzz
 * could (2026-11-24), so a confirmed write takes a medium impact.
 */
describe("haptics", () => {
  it("taps at medium strength on a confirmed write", () => {
    confirmedWriteHaptic();
    expect(Haptics.impactAsync).toHaveBeenCalledWith(
      Haptics.ImpactFeedbackStyle.Medium,
    );
  });

  it("buzzes the error notification on a refused write", () => {
    refusedWriteHaptic();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Error,
    );
  });

  it("never throws when the device cannot buzz", async () => {
    jest.mocked(Haptics.impactAsync).mockRejectedValueOnce(new Error("none"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => confirmedWriteHaptic()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(warn).toHaveBeenCalledWith("Haptic failed:", expect.any(Error));
    warn.mockRestore();
  });
});
