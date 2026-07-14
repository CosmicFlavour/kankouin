import * as React from "react"

export interface ConfirmOptions {
  title: string
  // Accepted for drop-in compatibility with the native
  // @tauri-apps/plugin-dialog confirm() call sites this replaces — every
  // caller so far asks for a destructive-action warning, so there's
  // currently only one visual treatment.
  kind?: "warning" | "info"
}

interface ConfirmRequest {
  id: string
  message: string
  title: string
}

type Listener = (request: ConfirmRequest | null) => void

// Single pending request at a time: a confirmation is always awaited before
// the caller does anything else, so nothing in this app can trigger a
// second one while the first is still open (same constraint the native
// confirm() dialog it replaces had).
let current: ConfirmRequest | null = null
let resolveCurrent: ((value: boolean) => void) | null = null
const listeners = new Set<Listener>()

function emit() {
  for (const listener of listeners) listener(current)
}

export function confirm(
  message: string,
  options: ConfirmOptions,
): Promise<boolean> {
  return new Promise((resolve) => {
    current = { id: crypto.randomUUID(), message, title: options.title }
    resolveCurrent = resolve
    emit()
  })
}

export function settleConfirm(value: boolean) {
  if (!current) return
  const resolve = resolveCurrent
  current = null
  resolveCurrent = null
  emit()
  resolve?.(value)
}

// Test-only: mirrors clearToasts() in useToast.ts — the pending request is a
// module-level singleton, so it survives across test cases unless reset.
export function resetConfirm() {
  current = null
  resolveCurrent = null
  emit()
}

export function useConfirmRequest() {
  const [request, setRequest] = React.useState<ConfirmRequest | null>(current)

  React.useEffect(() => {
    listeners.add(setRequest)
    return () => {
      listeners.delete(setRequest)
    }
  }, [])

  return request
}
