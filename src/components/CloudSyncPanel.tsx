import { useState } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { useCloudSync } from "@/hooks/useCloudSync";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/useToast";

function providerDisplayName(
  providerId: string,
  providers: { id: string; display_name: string }[],
) {
  return providers.find((p) => p.id === providerId)?.display_name ?? providerId;
}

export function CloudSyncPanel() {
  const {
    providers,
    status,
    actionError,
    connect,
    disconnect,
    setPassphrase,
    push,
    pull,
  } = useCloudSync();
  const [passphraseDraft, setPassphraseDraft] = useState("");
  const [changingPassphrase, setChangingPassphrase] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleConnect(providerId: string) {
    setBusy(true);
    try {
      await connect(providerId);
      toast({
        title: `Connected to ${providerDisplayName(providerId, providers)}`,
      });
    } catch {
      // actionError already surfaced by the hook
    } finally {
      setBusy(false);
    }
  }

  async function handleSavePassphrase() {
    if (!passphraseDraft) return;
    setBusy(true);
    try {
      await setPassphrase(passphraseDraft);
      setPassphraseDraft("");
      setChangingPassphrase(false);
      toast({ title: "Passphrase saved" });
    } catch {
      // actionError already surfaced
    } finally {
      setBusy(false);
    }
  }

  async function handlePush() {
    setBusy(true);
    try {
      await push();
      toast({ title: "Synced to cloud", description: "Push complete" });
    } catch {
      // actionError already surfaced
    } finally {
      setBusy(false);
    }
  }

  async function handlePull() {
    const confirmed = await confirm(
      "Pulling will overwrite all local data with the version from the cloud. This can't be undone.",
      { title: "Pull and overwrite local data?", kind: "warning" },
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      await pull();
      toast({ title: "Synced from cloud", description: "Reloading..." });
      setTimeout(() => window.location.reload(), 600);
    } catch {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    try {
      await disconnect();
      toast({ title: "Disconnected from cloud storage" });
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  return (
    <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
      <h2 className="text-sm font-medium text-muted-foreground">Cloud Storage</h2>

      {status.status === "not_connected" && (
        <div className="flex flex-wrap gap-2">
          {providers.map((provider) => (
            <Button
              key={provider.id}
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => handleConnect(provider.id)}
            >
              Connect {provider.display_name}
            </Button>
          ))}
        </div>
      )}

      {status.status === "connected" && (
        <>
          <p className="truncate text-xs text-muted-foreground">
            {status.account_label ?? status.provider}
          </p>

          {!status.has_passphrase || changingPassphrase ? (
            <div className="flex gap-2">
              <Input
                type="password"
                value={passphraseDraft}
                onChange={(e) => setPassphraseDraft(e.target.value)}
                placeholder="Encryption passphrase"
              />
              <Button type="button" size="sm" onClick={handleSavePassphrase} disabled={busy}>
                Save
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={handlePush} disabled={busy}>
                Push
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={handlePull} disabled={busy}>
                Pull
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setChangingPassphrase(true)}
              >
                Change passphrase
              </Button>
            </div>
          )}

          <Button type="button" size="sm" variant="ghost" onClick={handleDisconnect} disabled={busy}>
            Disconnect
          </Button>
        </>
      )}

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}
    </div>
  );
}
