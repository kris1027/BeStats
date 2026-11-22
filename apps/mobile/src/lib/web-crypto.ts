import { CryptoDigestAlgorithm, digest, getRandomValues } from "expo-crypto";

type DigestFn = (
  algorithm: string | { name: string },
  data: BufferSource,
) => Promise<ArrayBuffer>;

type CryptoLike = {
  getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T;
  subtle?: { digest?: DigestFn };
};

/**
 * Gives supabase-js the two WebCrypto calls its PKCE flow needs, from
 * `expo-crypto`, when the JavaScript runtime lacks them (spec 0033, child
 * 0036: a reset code may only be redeemed on the phone that asked).
 *
 * Without `crypto.subtle` supabase-js sends the verifier itself as a `plain`
 * challenge, and without `crypto.getRandomValues` it draws the verifier from
 * `Math.random`. Either weakens the one proof that binds a reset link to this
 * phone, so both come from the platform's secure generator and SHA-256
 * (AGENTS.md section 11; prompts/mobile-deep-links.md, decision 7). Only the
 * missing pieces are added; a runtime that has real ones keeps them.
 *
 * @param target The global object; a parameter so a test can pass its own.
 */
export function installWebCrypto(
  target: { crypto?: CryptoLike } = globalThis as { crypto?: CryptoLike },
): void {
  const current: CryptoLike = target.crypto ?? {};
  if (!target.crypto) target.crypto = current;
  if (typeof current.getRandomValues !== "function") {
    current.getRandomValues = (array) =>
      getRandomValues(
        array as unknown as Uint8Array,
      ) as unknown as typeof array;
  }
  if (typeof current.subtle?.digest !== "function") {
    const sha256: DigestFn = (algorithm, data) => {
      const name = typeof algorithm === "string" ? algorithm : algorithm.name;
      if (name.toUpperCase() !== "SHA-256") {
        return Promise.reject(new Error(`Unsupported digest: ${name}`));
      }
      return digest(CryptoDigestAlgorithm.SHA256, data);
    };
    current.subtle = { ...current.subtle, digest: sha256 };
  }
}
