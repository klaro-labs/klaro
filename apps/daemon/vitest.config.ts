import { defineConfig } from "vitest/config";

// daemon test infrastructure. Mirrors the web app's
// vitest setup. Tests live in apps/daemon/test/. Each test mocks the
// Redis + Supabase modules so the daemon's pure logic (idempotency
// counters, payload schemas, retry semantics) can be exercised without
// real infrastructure.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globals: false,
  },
});
