import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { Mock } from "vitest";

// Both modules are replaced with vi.fn()s in src/test/setup.ts; these casts
// just give tests the mocks' assertion/config methods back.
export const mockInvoke = invoke as unknown as Mock;
export const mockOpen = open as unknown as Mock;
export const mockSave = save as unknown as Mock;

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
