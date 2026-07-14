import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import { useConfirmRequest, settleConfirm } from "@/hooks/useConfirm"

export function ConfirmDialog() {
  const request = useConfirmRequest()

  return (
    <AlertDialog
      open={!!request}
      onOpenChange={(open) => {
        // Escape / outside click closes without confirming, same as
        // dismissing the native dialog this replaces.
        if (!open) settleConfirm(false)
      }}
    >
      <AlertDialogContent>
        {request && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{request.title}</AlertDialogTitle>
              <AlertDialogDescription>{request.message}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => settleConfirm(false)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={() => settleConfirm(true)}>
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
