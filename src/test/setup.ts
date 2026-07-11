import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Every hook talks to the Rust backend exclusively through this function, so
// mocking it once here (rather than per test file) is enough to isolate all
// hook/component tests from a real Tauri runtime.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// jsdom doesn't implement matchMedia; useSettings reads it as the dark-mode
// fallback when no theme is stored yet. Defaults to "no preference" (light);
// individual tests can override with vi.spyOn(window, "matchMedia").
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

afterEach(() => {
  // Vitest isn't run with `globals: true`, so @testing-library/react can't
  // detect a global `afterEach` to auto-register its own cleanup — do it
  // explicitly, or component trees from one test leak into the next.
  cleanup();
  vi.clearAllMocks();
});
