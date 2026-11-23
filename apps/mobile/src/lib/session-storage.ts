import AsyncStorage from "@react-native-async-storage/async-storage";
import * as aesjs from "aes-js";
import { getRandomBytes } from "expo-crypto";
import * as SecureStore from "expo-secure-store";

/**
 * Decodes UTF-8 bytes as the exact inverse of `aesjs.utils.utf8.toBytes`
 * (which percent encodes through `encodeURI`). aes-js's own `fromBytes`
 * stops at 3 byte characters, so an emoji in a display name came back as
 * broken JSON and the stored session was lost (AGENTS.md section 11, a
 * failed restore must never look like a sign out the user chose). Pure JS,
 * since Hermes's `TextDecoder` support varies by version.
 */
function utf8FromBytes(bytes: Uint8Array): string {
  let encoded = "";
  for (const byte of bytes) {
    encoded += `%${byte.toString(16).padStart(2, "0")}`;
  }
  return decodeURIComponent(encoded);
}

/**
 * The storage adapter `supabase-js` keeps the session in (spec 0033, AC-11;
 * child 0036, Session storage), after Supabase's Expo guide.
 *
 * A full session can exceed what `expo-secure-store` holds per value, so the
 * session itself sits in AsyncStorage, AES encrypted, and only its random
 * 256 bit key sits in the Keychain or Keystore. Every write draws a fresh key,
 * so a counter mode stream is never reused under the same key. AsyncStorage
 * therefore never holds a readable token.
 */
export const encryptedSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    const keyHex = await SecureStore.getItemAsync(key);
    if (!keyHex) return null;
    const cipher = new aesjs.ModeOfOperation.ctr(
      aesjs.utils.hex.toBytes(keyHex),
      new aesjs.Counter(1),
    );
    try {
      return utf8FromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(encrypted)));
    } catch {
      // A key that no longer matches its ciphertext decrypts to bytes that
      // are not UTF-8: no session, as when the key is missing.
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    const encryptionKey = getRandomBytes(32);
    const cipher = new aesjs.ModeOfOperation.ctr(
      encryptionKey,
      new aesjs.Counter(1),
    );
    const encrypted = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(
      key,
      aesjs.utils.hex.fromBytes(encryptionKey),
    );
    await AsyncStorage.setItem(key, aesjs.utils.hex.fromBytes(encrypted));
  },

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  },
};
