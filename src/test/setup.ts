import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Every hook talks to the Rust backend exclusively through this function, so
// mocking it once here (rather than per test file) is enough to isolate all
// hook/component tests from a real Tauri runtime.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// Several components (DatabasePanel, CloudSyncPanel, and every delete/archive
// confirmation) gate a destructive action behind the native confirm dialog. Mocking it
// here means a test that doesn't care about it gets the safe default
// (confirm() resolves to undefined, i.e. "cancelled") instead of hitting a
// real Tauri plugin that doesn't exist in jsdom.
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
  confirm: vi.fn(),
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

// jsdom doesn't implement the pointer-capture methods; @dnd-kit's pointer
// sensor calls them on drag start (TaskCard/TaskColumn use useDraggable /
// useDroppable), and the resulting TypeError otherwise swallows the
// subsequent click silently instead of failing loudly.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}

// jsdom doesn't implement scrollIntoView; Radix's Select calls it on the
// selected item when the popup opens.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

afterEach(() => {
  // Vitest isn't run with `globals: true`, so @testing-library/react can't
  // detect a global `afterEach` to auto-register its own cleanup — do it
  // explicitly, or component trees from one test leak into the next.
  cleanup();
  vi.clearAllMocks();
});
