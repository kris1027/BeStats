/**
 * covers: spec 0033, AC-11; child 0036, Session storage. AsyncStorage never
 * holds a readable token, only the Keychain holds the key, and every write
 * draws a fresh key.
 */
const mockSecure = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => mockSecure.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    mockSecure.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    mockSecure.delete(key);
  },
}));
jest.mock("expo-crypto", () => ({
  getRandomBytes: (size: number) =>
    new Uint8Array(require("node:crypto").randomBytes(size)),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";

import { encryptedSessionStorage } from "./session-storage";

const KEY = "bestats-auth";
const SESSION = JSON.stringify({
  access_token: "eyJ.secret.token",
  refresh_token: "refresh-abc",
  user: { email: "a@example.test" },
});

beforeEach(async () => {
  mockSecure.clear();
  await AsyncStorage.clear();
});

test("a stored session reads back exactly as written", async () => {
  await encryptedSessionStorage.setItem(KEY, SESSION);
  await expect(encryptedSessionStorage.getItem(KEY)).resolves.toBe(SESSION);
});

test("AsyncStorage holds only ciphertext, never the token", async () => {
  await encryptedSessionStorage.setItem(KEY, SESSION);
  const stored = await AsyncStorage.getItem(KEY);
  expect(stored).toMatch(/^[0-9a-f]+$/);
  expect(stored).not.toContain("secret");
  expect(stored).not.toContain("refresh-abc");
});

test("only a 256 bit key sits in the secure store", async () => {
  await encryptedSessionStorage.setItem(KEY, SESSION);
  expect(mockSecure.get(KEY)).toMatch(/^[0-9a-f]{64}$/);
});

test("every write draws a fresh key, so the same session never encrypts the same way", async () => {
  await encryptedSessionStorage.setItem(KEY, SESSION);
  const firstKey = mockSecure.get(KEY);
  const firstCipher = await AsyncStorage.getItem(KEY);
  await encryptedSessionStorage.setItem(KEY, SESSION);
  expect(mockSecure.get(KEY)).not.toBe(firstKey);
  expect(await AsyncStorage.getItem(KEY)).not.toBe(firstCipher);
  await expect(encryptedSessionStorage.getItem(KEY)).resolves.toBe(SESSION);
});

test("nothing stored reads as no session", async () => {
  await expect(encryptedSessionStorage.getItem(KEY)).resolves.toBeNull();
});

test("ciphertext without its key reads as no session, never garbage", async () => {
  await encryptedSessionStorage.setItem(KEY, SESSION);
  mockSecure.delete(KEY);
  await expect(encryptedSessionStorage.getItem(KEY)).resolves.toBeNull();
});

test("ciphertext under a key that no longer matches reads as no session", async () => {
  await encryptedSessionStorage.setItem(KEY, "é".repeat(64));
  mockSecure.set(KEY, "00".repeat(32));
  await expect(encryptedSessionStorage.getItem(KEY)).resolves.toBeNull();
});

test("removing the session deletes both the ciphertext and its key", async () => {
  await encryptedSessionStorage.setItem(KEY, SESSION);
  await encryptedSessionStorage.removeItem(KEY);
  expect(await AsyncStorage.getItem(KEY)).toBeNull();
  expect(mockSecure.has(KEY)).toBe(false);
  await expect(encryptedSessionStorage.getItem(KEY)).resolves.toBeNull();
});

test("a session with accented text survives the round trip", async () => {
  const value = JSON.stringify({ user: { name: "Zoë Łódź" } });
  await encryptedSessionStorage.setItem(KEY, value);
  await expect(encryptedSessionStorage.getItem(KEY)).resolves.toBe(value);
});

test("a session whose name holds an emoji still reads back as valid JSON", async () => {
  // A Google account's display name lands in the session's user_metadata,
  // and an emoji there is a 4 byte UTF-8 character.
  const value = JSON.stringify({
    user: { user_metadata: { name: "Kris 🎬" } },
  });
  await encryptedSessionStorage.setItem(KEY, value);
  const read = await encryptedSessionStorage.getItem(KEY);
  expect(read).toBe(value);
  expect(() => JSON.parse(read ?? "")).not.toThrow();
});
