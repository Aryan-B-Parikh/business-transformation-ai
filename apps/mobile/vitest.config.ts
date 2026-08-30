import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/**/*.test.tsx", "src/**/*.test.tsx"],
    alias: {
      "react-native": "react-native-web"
    }
  },
});
