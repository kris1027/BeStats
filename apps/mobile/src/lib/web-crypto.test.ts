import { installWebCrypto } from "./web-crypto";

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  getRandomValues: (array: Uint8Array) =>
    jest.requireActual("node:crypto").randomFillSync(array),
  digest: async (_algorithm: string, data: Uint8Array) => {
    const hash = jest
      .requireActual("node:crypto")
      .createHash("sha256")
      .update(data)
      .digest();
    return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.length);
  },
}));

/**
 * covers: spec 0033, child 0036 (a reset code redeemable only on the phone
 * that asked); prompts/mobile-deep-links.md, decision 7. supabase-js only
 * sends an S256 challenge, from a secure verifier, when these two exist.
 */
describe("installWebCrypto", () => {
  it("adds SHA-256 and secure random values to a runtime without them", async () => {
    const target: Parameters<typeof installWebCrypto>[0] = {};
    installWebCrypto(target);

    const hash = await target.crypto?.subtle?.digest?.(
      "SHA-256",
      new TextEncoder().encode("abc"),
    );
    expect(Buffer.from(hash as ArrayBuffer).toString("hex")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    const bytes = target.crypto?.getRandomValues?.(new Uint8Array(32));
    expect(bytes?.some((byte) => byte !== 0)).toBe(true);
  });

  it("refuses any other digest", async () => {
    const target: Parameters<typeof installWebCrypto>[0] = {};
    installWebCrypto(target);
    await expect(
      target.crypto?.subtle?.digest?.("SHA-1", new Uint8Array(1)),
    ).rejects.toThrow("Unsupported digest");
  });

  it("keeps a runtime's own implementations", () => {
    const own = { getRandomValues: jest.fn(), subtle: { digest: jest.fn() } };
    const target = { crypto: own };
    installWebCrypto(target);
    expect(target.crypto.getRandomValues).toBe(own.getRandomValues);
    expect(target.crypto.subtle.digest).toBe(own.subtle.digest);
  });
});
