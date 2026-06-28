// Jest configuration. The Improv protocol core (`lib/ble/improv.ts`) is pure
// logic with no React Native imports, so the lightweight `node` environment
// from jest-expo's preset is enough and avoids booting the RN runtime.
module.exports = {
  preset: "jest-expo",
  testEnvironment: "node",
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
};
