const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");

// Expo's Metro config detects the pnpm workspace on its own, so
// `@bestats/core` (TypeScript source, no build step) resolves and hot reloads
// like a file of this app (spec 0033, child 0034).
/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

module.exports = withNativewind(config);
