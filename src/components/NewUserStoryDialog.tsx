import { useState } from "react";
import type { Epic } from "@/hooks/useEpics";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface NewUserStoryDialogProps {
  trigger: React.ReactNode;
  epics: Epic[];
  defaultEpicId?: string | null;
  onCreate: (title: string, epicId: string | null) => Promise<unknown>;
}

export function NewUserStoryDialog({
  trigger,
  epics,
  defaultEpicId,
  onCreate,
}: NewUserStoryDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [epicId, setEpicId] = useState(defaultEpicId ?? "");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await onCreate(title.trim(), epicId || null);
      setTitle("");
      setError(null);
      setOpen(false);
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setEpicId(defaultEpicId ?? "");
        else setError(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New user story</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="User story title"
          />
          <select
            value={epicId}
            onChange={(e) => setEpicId(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
          >
            <option value="">No epic</option>
            {epics.map((epic) => (
              <option key={epic.id} value={epic.id}>
                {epic.title}
              </option>
            ))}
          </select>
          <Button type="submit">Create user story</Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      </DialogContent>
    </Dialog>
  );
}
