import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/kyouen-game/",
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 120000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
