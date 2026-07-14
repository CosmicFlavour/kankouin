import {
  ToastProvider,
  ToastViewport,
  ToastRoot,
  ToastTitle,
  ToastDescription,
  ToastClose,
} from "@/components/ui/toast"
import { useToast } from "@/hooks/useToast"

export function Toaster() {
  const { toasts, dismiss } = useToast()

  return (
    <ToastProvider>
      {toasts.map(({ id, title, description, variant }) => (
        <ToastRoot
          key={id}
          variant={variant}
          onOpenChange={(open) => {
            if (!open) dismiss(id)
          }}
        >
          <div className="grid gap-1">
            <ToastTitle>{title}</ToastTitle>
            {description && <ToastDescription>{description}</ToastDescription>}
          </div>
          <ToastClose />
        </ToastRoot>
      ))}
      <ToastViewport />
    </ToastProvider>
  )
}
