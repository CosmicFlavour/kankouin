import { invoke } from "@tauri-apps/api/core";
import type { Mock } from "vitest";

// `@tauri-apps/api/core` is replaced with a `vi.fn()` in src/test/setup.ts;
// this cast just gives tests the mock's assertion/config methods back.
export const mockInvoke = invoke as unknown as Mock;

type CommandHandler = (args?: Record<string, unknown>) => unknown;

// Routes each `invoke(command, args)` call to a handler by command name, so
// a test can describe "what the backend returns" without caring about call
// order. Throwing inside a handler rejects the invoke() call, same as a
// real Tauri command returning Err(...).
export function mockCommands(handlers: Record<string, CommandHandler>) {
  mockInvoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
    const handler = handlers[command];
    if (!handler) {
      return Promise.reject(new Error(`Unmocked command: ${command}`));
    }
    try {
      return Promise.resolve(handler(args));
    } catch (err) {
      return Promise.reject(err);
    }
  });
}
