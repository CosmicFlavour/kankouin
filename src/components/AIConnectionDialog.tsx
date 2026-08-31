import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_AI_TIMEOUT_SECONDS,
  type AIConnection,
} from "@/hooks/useSettings";

interface AIConnectionDialogProps {
  trigger: React.ReactNode;
  connection: AIConnection | null;
  onSave: (
    provider: string,
    baseUrl: string,
    apiKey: string,
    model: string,
    timeoutSeconds: number,
    caCertificatePath: string | null,
  ) => Promise<unknown>;
  onClear: () => Promise<unknown>;
}

interface TestResult {
  model_found: boolean;
  available_models: string[];
}

const CA_CERT_FILTERS = [{ name: "Certificates", extensions: ["pem", "crt"] }];

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
  const [timeoutSeconds, setTimeoutSeconds] = useState(
    String(DEFAULT_AI_TIMEOUT_SECONDS),
  );
  const [caCertPath, setCaCertPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // Re-seed the form from the current connection each time the dialog
  // opens, rather than keeping local draft state that could go stale.
  useEffect(() => {
    if (!open) return;
    setBaseUrl(connection?.base_url ?? "");
    setApiKey(connection?.api_key ?? "");
    setModel(connection?.model ?? "");
    setTimeoutSeconds(
      String(connection?.timeout_seconds ?? DEFAULT_AI_TIMEOUT_SECONDS),
    );
    setCaCertPath(connection?.ca_certificate_path ?? "");
    setError(null);
    setTestResult(null);
  }, [open, connection]);

  // A previous test result stops being trustworthy the moment any of the
  // fields it was based on changes.
  function updateField(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setTestResult(null);
    };
  }

  function parsedTimeout(): number | null {
    const parsed = Number(timeoutSeconds);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  async function handleBrowseCaCert() {
    const path = await open({ multiple: false, filters: CA_CERT_FILTERS });
    if (!path || Array.isArray(path)) return;
    updateField(setCaCertPath)(path);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const timeout = parsedTimeout();
    if (!baseUrl.trim() || !model.trim() || timeout === null) return;
    setBusy(true);
    try {
      await onSave(
        "openwebui",
        baseUrl.trim(),
        apiKey.trim(),
        model.trim(),
        timeout,
        caCertPath.trim() || null,
      );
      setOpen(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    const timeout = parsedTimeout();
    if (!baseUrl.trim() || !model.trim() || timeout === null) return;
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const result = await invoke<TestResult>("test_ai_connection", {
        provider: "openwebui",
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        model: model.trim(),
        timeoutSeconds: timeout,
        caCertificatePath: caCertPath.trim() || null,
      });
      setTestResult(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setTesting(false);
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
            onChange={(e) => updateField(setBaseUrl)(e.target.value)}
            placeholder="Base URL (e.g. https://openwebui.yourcompany.internal)"
          />
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => updateField(setApiKey)(e.target.value)}
            placeholder="API key"
          />
          <Input
            value={model}
            onChange={(e) => updateField(setModel)(e.target.value)}
            placeholder="Model (e.g. sonnet-5)"
          />
          <Input
            type="number"
            min={1}
            max={600}
            value={timeoutSeconds}
            onChange={(e) => updateField(setTimeoutSeconds)(e.target.value)}
            placeholder="Request timeout (seconds)"
          />
          <div className="flex gap-2">
            <Input
              value={caCertPath}
              onChange={(e) => updateField(setCaCertPath)(e.target.value)}
              placeholder="CA certificate path (optional, for internal CAs)"
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleBrowseCaCert}
              disabled={busy}
            >
              Browse…
            </Button>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleTest}
            disabled={testing || busy}
          >
            {testing ? "Testing…" : "Test connection"}
          </Button>
          {testResult &&
            (testResult.model_found ? (
              <p className="text-sm text-green-700 dark:text-green-400">
                Connected — model "{model.trim()}" is available.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Connected, but "{model.trim()}" wasn't found.{" "}
                {testResult.available_models.length > 0
                  ? `Available models: ${testResult.available_models.join(", ")}`
                  : "No models were returned."}
              </p>
            ))}

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
