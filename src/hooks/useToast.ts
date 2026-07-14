import * as React from "react"

export type ToastVariant = "default" | "destructive"

export type ToastItem = {
  id: string
  title: string
  description?: string
  variant: ToastVariant
}

type Listener = (toasts: ToastItem[]) => void

const TOAST_DURATION_MS = 4000

let toasts: ToastItem[] = []
const listeners = new Set<Listener>()

function emit() {
  for (const listener of listeners) listener(toasts)
}

function dismiss(id: string) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function toast(options: {
  title: string
  description?: string
  variant?: ToastVariant
}) {
  const id = crypto.randomUUID()
  toasts = [...toasts, { id, variant: "default", ...options }]
  emit()
  setTimeout(() => dismiss(id), TOAST_DURATION_MS)
  return id
}

export function useToast() {
  const [state, setState] = React.useState<ToastItem[]>(toasts)

  React.useEffect(() => {
    listeners.add(setState)
    return () => {
      listeners.delete(setState)
    }
  }, [])

  return { toasts: state, dismiss }
}

// Test-only: the toast list is a module-level singleton so it survives
// unrelated component unmounts, which means it also survives across test
// cases unless explicitly cleared between them.
export function clearToasts() {
  toasts = []
  emit()
}
