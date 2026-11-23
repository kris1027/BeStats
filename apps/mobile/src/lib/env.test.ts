/**
 * covers: spec 0033, AC-3; child 0036. The public config is validated lazily,
 * a bad value fails naming the variable and never echoing its value.
 */
const NAMES = [
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "EXPO_PUBLIC_API_BASE_URL",
  "EXPO_PUBLIC_AUTH_EMAIL_DELIVERY",
] as const;

const saved = Object.fromEntries(
  NAMES.map((name) => [name, process.env[name]]),
);

function setEnv(values: Partial<Record<(typeof NAMES)[number], string>>) {
  for (const name of NAMES) delete process.env[name];
  Object.assign(process.env, values);
}

/** A fresh module, so the cached value of one test never leaks into the next. */
function loadEnv(): typeof import("./env") {
  let mod: typeof import("./env") | undefined;
  jest.isolateModules(() => {
    mod = require("./env");
  });
  return mod as typeof import("./env");
}

const VALID = {
  EXPO_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  EXPO_PUBLIC_API_BASE_URL: "http://localhost:3000",
};

afterAll(() => {
  for (const name of NAMES) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

test("reads a valid config, with email delivery off by default", () => {
  setEnv(VALID);
  expect(loadEnv().getPublicEnv()).toEqual({
    ...VALID,
    EXPO_PUBLIC_AUTH_EMAIL_DELIVERY: "off",
  });
});

test("trims trailing slashes from the API base URL", () => {
  setEnv({ ...VALID, EXPO_PUBLIC_API_BASE_URL: "https://bestats.test///" });
  expect(loadEnv().getPublicEnv().EXPO_PUBLIC_API_BASE_URL).toBe(
    "https://bestats.test",
  );
});

test("accepts email delivery on", () => {
  setEnv({ ...VALID, EXPO_PUBLIC_AUTH_EMAIL_DELIVERY: "on" });
  expect(loadEnv().getPublicEnv().EXPO_PUBLIC_AUTH_EMAIL_DELIVERY).toBe("on");
});

test("importing the module never throws, so a missing config fails only when used", () => {
  setEnv({});
  expect(() => loadEnv()).not.toThrow();
});

test("a missing variable fails naming it and pointing at .env.example", () => {
  setEnv({ ...VALID, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" });
  expect(() => loadEnv().getPublicEnv()).toThrow(
    /EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.*\.env\.example/,
  );
});

test("a malformed value is named but never echoed", () => {
  setEnv({ ...VALID, EXPO_PUBLIC_SUPABASE_URL: "not-a-url-secretish" });
  let message = "";
  try {
    loadEnv().getPublicEnv();
  } catch (error) {
    message = (error as Error).message;
  }
  expect(message).toContain("EXPO_PUBLIC_SUPABASE_URL");
  expect(message).not.toContain("not-a-url-secretish");
});

test("an unknown email delivery value is refused", () => {
  setEnv({ ...VALID, EXPO_PUBLIC_AUTH_EMAIL_DELIVERY: "yes" });
  expect(() => loadEnv().getPublicEnv()).toThrow(
    /EXPO_PUBLIC_AUTH_EMAIL_DELIVERY/,
  );
});

test("every missing variable is named at once", () => {
  setEnv({});
  expect(() => loadEnv().getPublicEnv()).toThrow(
    /EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, EXPO_PUBLIC_API_BASE_URL/,
  );
});

test("a valid config is read once and kept for the session", () => {
  setEnv(VALID);
  const { getPublicEnv } = loadEnv();
  const first = getPublicEnv();
  setEnv({});
  expect(getPublicEnv()).toBe(first);
});
