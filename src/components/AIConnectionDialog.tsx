import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AIConnection } from "@/hooks/useSettings";

interface AIConnectionDialogProps {
  trigger: React.ReactNode;
  connection: AIConnection | null;
  onSave: (
    provider: string,
    baseUrl: string,
    apiKey: string,
    model: string,
  ) => Promise<unknown>;
  onClear: () => Promise<unknown>;
}

// Only OpenWebUI is supported today, so "provider" is a fixed label rather
// than a picker — AIConnection.provider still exists as a real field so a
// picker can be added later without a storage-shape change.
export function AIConnectionDialog({
  trigger,
  connection,
  onSave,
  onClear,
}: AIConnectionDialogProps) {
  const [open, setOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-seed the form from the current connection each time the dialog
  // opens, rather than keeping local draft state that could go stale.
  useEffect(() => {
    if (!open) return;
    setBaseUrl(connection?.base_url ?? "");
    setApiKey(connection?.api_key ?? "");
    setModel(connection?.model ?? "");
    setError(null);
  }, [open, connection]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!baseUrl.trim() || !model.trim()) return;
    setBusy(true);
    try {
      await onSave("openwebui", baseUrl.trim(), apiKey.trim(), model.trim());
      setOpen(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleClear() {
    setBusy(true);
    try {
      await onClear();
      setOpen(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AI connection</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">Provider: OpenWebUI</p>
          <Input
            autoFocus
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="Base URL (e.g. https://openwebui.yourcompany.internal)"
          />
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="API key"
          />
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Model (e.g. sonnet-5)"
          />
          <Button type="submit" disabled={busy}>
            Save
          </Button>
          {connection && (
            <Button
              type="button"
              variant="ghost"
              onClick={handleClear}
              disabled={busy}
            >
              Clear connection
            </Button>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      </DialogContent>
    </Dialog>
  );
}
