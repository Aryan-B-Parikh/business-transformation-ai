import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/**/*.test.tsx", "src/**/*.test.tsx"],
    alias: {
      "react-native": "react-native-web",
      "expo-document-picker": new URL("./src/mocks/expo-document-picker.ts", import.meta.url).pathname,
      "expo-secure-store": new URL("./src/mocks/expo-secure-store.ts", import.meta.url).pathname
    }
  },
});
