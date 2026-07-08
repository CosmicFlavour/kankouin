import { useState } from "react";
import { useEpics } from "@/hooks/useEpics";
import { useUserStories } from "@/hooks/useUserStories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type TaskScope =
  | { type: "epic"; id: string }
  | { type: "story"; id: string }
  | null;

interface HierarchyPanelProps {
  projectId: string;
  scope: TaskScope;
  onScopeChange: (scope: TaskScope) => void;
}

export function HierarchyPanel({
  projectId,
  scope,
  onScopeChange,
}: HierarchyPanelProps) {
  const { epics, loading: epicsLoading, error: epicsError, createEpic } =
    useEpics(projectId);
  const {
    userStories,
    loading: storiesLoading,
    error: storiesError,
    createUserStory,
  } = useUserStories(projectId);
  const [newEpicTitle, setNewEpicTitle] = useState("");
  const [epicCreateError, setEpicCreateError] = useState<string | null>(null);
  const [newStoryTitle, setNewStoryTitle] = useState("");
  const [newStoryEpicId, setNewStoryEpicId] = useState("");
  const [storyCreateError, setStoryCreateError] = useState<string | null>(
    null,
  );

  function isSelected(type: "epic" | "story", id: string) {
    return scope?.type === type && scope.id === id;
  }

  async function handleCreateEpic(e: React.FormEvent) {
    e.preventDefault();
    if (!newEpicTitle.trim()) return;
    try {
      await createEpic(newEpicTitle.trim());
      setNewEpicTitle("");
      setEpicCreateError(null);
    } catch (err) {
      setEpicCreateError(String(err));
    }
  }

  async function handleCreateStory(e: React.FormEvent) {
    e.preventDefault();
    if (!newStoryTitle.trim()) return;
    try {
      await createUserStory(newStoryTitle.trim(), newStoryEpicId || null);
      setNewStoryTitle("");
      setStoryCreateError(null);
    } catch (err) {
      setStoryCreateError(String(err));
    }
  }

  const unassignedStories = userStories.filter((s) => !s.epic_id);

  return (
    <div className="flex w-56 shrink-0 flex-col gap-3 border-r border-border pr-4 text-sm">
      <button
        type="button"
        onClick={() => onScopeChange(null)}
        className={cn(
          "rounded-md px-2 py-1 text-left hover:bg-muted",
          scope === null && "bg-accent",
        )}
      >
        All tasks
      </button>

      {epicsLoading && <p className="text-muted-foreground">Loading...</p>}
      {epicsError && (
        <p className="text-muted-foreground">
          Couldn't load epics: {epicsError}
        </p>
      )}
      {storiesError && (
        <p className="text-muted-foreground">
          Couldn't load user stories: {storiesError}
        </p>
      )}

      <div className="flex flex-col gap-1">
        {epics.map((epic) => (
          <div key={epic.id} className="flex flex-col">
            <button
              type="button"
              onClick={() => onScopeChange({ type: "epic", id: epic.id })}
              className={cn(
                "rounded-md px-2 py-1 text-left hover:bg-muted",
                isSelected("epic", epic.id) && "bg-accent",
              )}
            >
              {epic.title}
            </button>
            {userStories
              .filter((s) => s.epic_id === epic.id)
              .map((story) => (
                <button
                  key={story.id}
                  type="button"
                  onClick={() => onScopeChange({ type: "story", id: story.id })}
                  className={cn(
                    "ml-4 rounded-md px-2 py-1 text-left text-muted-foreground hover:bg-muted",
                    isSelected("story", story.id) &&
                      "bg-accent text-foreground",
                  )}
                >
                  {story.title}
                </button>
              ))}
          </div>
        ))}

        {!storiesLoading &&
          unassignedStories.map((story) => (
            <button
              key={story.id}
              type="button"
              onClick={() => onScopeChange({ type: "story", id: story.id })}
              className={cn(
                "rounded-md px-2 py-1 text-left hover:bg-muted",
                isSelected("story", story.id) && "bg-accent",
              )}
            >
              {story.title}
            </button>
          ))}
      </div>

      <form
        onSubmit={handleCreateEpic}
        className="flex flex-col gap-1 border-t border-border pt-2"
      >
        <Input
          value={newEpicTitle}
          onChange={(e) => setNewEpicTitle(e.target.value)}
          placeholder="New epic"
          className="h-8"
        />
        <Button type="submit" size="sm" variant="outline">
          Add epic
        </Button>
        {epicCreateError && (
          <p className="text-destructive">{epicCreateError}</p>
        )}
      </form>

      <form onSubmit={handleCreateStory} className="flex flex-col gap-1">
        <Input
          value={newStoryTitle}
          onChange={(e) => setNewStoryTitle(e.target.value)}
          placeholder="New user story"
          className="h-8"
        />
        <select
          value={newStoryEpicId}
          onChange={(e) => setNewStoryEpicId(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs"
        >
          <option value="">No epic</option>
          {epics.map((epic) => (
            <option key={epic.id} value={epic.id}>
              {epic.title}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="outline">
          Add user story
        </Button>
        {storyCreateError && (
          <p className="text-destructive">{storyCreateError}</p>
        )}
      </form>
    </div>
  );
}
