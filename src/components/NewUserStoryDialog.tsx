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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Radix's Select.Item forbids an empty-string value, so "no epic" needs its
// own sentinel to round-trip through onValueChange.
const NO_EPIC = "__no_epic__";

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
          <Select
            value={epicId || NO_EPIC}
            onValueChange={(value) => setEpicId(value === NO_EPIC ? "" : value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_EPIC}>No epic</SelectItem>
              {epics.map((epic) => (
                <SelectItem key={epic.id} value={epic.id}>
                  {epic.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit">Create user story</Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      </DialogContent>
    </Dialog>
  );
}
