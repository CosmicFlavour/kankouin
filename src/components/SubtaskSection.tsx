import { useState } from "react";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { useTaskDetail } from "@/hooks/useTaskDetail";
import { toast } from "@/hooks/useToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SubtaskSection({ taskId }: { taskId: string }) {
  const { detail, loading, error, addSubtask, toggleSubtask, breakIntoSubtasks } =
    useTaskDetail(taskId);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [breaking, setBreaking] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;
    try {
      await addSubtask(newSubtaskTitle.trim());
      setNewSubtaskTitle("");
      setAddError(null);
    } catch (err) {
      setAddError(String(err));
    }
  }

  async function handleToggle(subtaskId: string) {
    try {
      await toggleSubtask(subtaskId);
      setToggleError(null);
    } catch (err) {
      setToggleError(String(err));
    }
  }

  async function handleBreakIntoSubtasks() {
    setBreaking(true);
    try {
      const result = await breakIntoSubtasks();
      const count = result.actions.length;
      toast({
        title: "Task broken into subtasks",
        description: `${count} subtask${count === 1 ? "" : "s"} added`,
      });
    } catch (err) {
      toast({
        title: "Couldn't break task into subtasks",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setBreaking(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex items-center justify-between">
        <h4 className="text-muted-foreground">Subtasks</h4>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={handleBreakIntoSubtasks}
          disabled={breaking}
        >
          {breaking ? (
            <Loader2Icon className="size-3 animate-spin" />
          ) : (
            <SparklesIcon className="size-3" />
          )}
          Break into subtasks
        </Button>
      </div>
      {loading && <p className="text-muted-foreground">Loading...</p>}
      {error && (
        <p className="text-muted-foreground">Couldn't load subtasks: {error}</p>
      )}
      {detail && (
        <div className="flex flex-col gap-1">
          {detail.subtasks.length === 0 && (
            <p className="text-muted-foreground">No subtasks yet</p>
          )}
          {detail.subtasks.map((subtask) => (
            <label key={subtask.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={subtask.done}
                onChange={() => handleToggle(subtask.id)}
              />
              <span
                className={subtask.done ? "text-muted-foreground line-through" : undefined}
              >
                {subtask.title}
              </span>
            </label>
          ))}
        </div>
      )}
      {toggleError && <p className="text-destructive">{toggleError}</p>}

      <form onSubmit={handleAdd} className="flex flex-col gap-2">
        <Input
          value={newSubtaskTitle}
          onChange={(e) => setNewSubtaskTitle(e.target.value)}
          placeholder="New subtask"
        />
        <Button type="submit" size="sm" variant="outline">
          Add subtask
        </Button>
        {addError && <p className="text-destructive">{addError}</p>}
      </form>
    </div>
  );
}
