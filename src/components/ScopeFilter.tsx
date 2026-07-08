import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import type { Epic } from "@/hooks/useEpics";
import type { UserStory } from "@/hooks/useUserStories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type TaskScope =
  | { type: "epic"; id: string }
  | { type: "story"; id: string }
  | null;

function scopeLabel(
  scope: TaskScope,
  epics: Epic[],
  userStories: UserStory[],
): string {
  if (scope === null) return "All tasks";
  if (scope.type === "epic") {
    return epics.find((e) => e.id === scope.id)?.title ?? "Epic";
  }
  return userStories.find((s) => s.id === scope.id)?.title ?? "User story";
}

interface ScopeFilterProps {
  scope: TaskScope;
  onScopeChange: (scope: TaskScope) => void;
  epics: Epic[];
  epicsLoading: boolean;
  epicsError: string | null;
  onCreateEpic: (title: string) => Promise<unknown>;
  userStories: UserStory[];
  storiesLoading: boolean;
  storiesError: string | null;
  onCreateUserStory: (title: string, epicId: string | null) => Promise<unknown>;
}

export function ScopeFilter({
  scope,
  onScopeChange,
  epics,
  epicsLoading,
  epicsError,
  onCreateEpic,
  userStories,
  storiesLoading,
  storiesError,
  onCreateUserStory,
}: ScopeFilterProps) {
  const [open, setOpen] = useState(false);
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

  function selectScope(next: TaskScope) {
    onScopeChange(next);
    setOpen(false);
  }

  async function handleCreateEpic(e: React.FormEvent) {
    e.preventDefault();
    if (!newEpicTitle.trim()) return;
    try {
      await onCreateEpic(newEpicTitle.trim());
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
      await onCreateUserStory(newStoryTitle.trim(), newStoryEpicId || null);
      setNewStoryTitle("");
      setStoryCreateError(null);
    } catch (err) {
      setStoryCreateError(String(err));
    }
  }

  const unassignedStories = userStories.filter((s) => !s.epic_id);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          {scopeLabel(scope, epics, userStories)}
          <ChevronDownIcon className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex flex-col gap-3">
        {epicsLoading && (
          <p className="text-muted-foreground">Loading...</p>
        )}
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
          <button
            type="button"
            onClick={() => selectScope(null)}
            className={cn(
              "rounded-md px-2 py-1 text-left hover:bg-muted",
              scope === null && "bg-accent",
            )}
          >
            All tasks
          </button>

          {epics.map((epic) => (
            <div key={epic.id} className="flex flex-col">
              <button
                type="button"
                onClick={() => selectScope({ type: "epic", id: epic.id })}
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
                    onClick={() =>
                      selectScope({ type: "story", id: story.id })
                    }
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
                onClick={() => selectScope({ type: "story", id: story.id })}
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
      </PopoverContent>
    </Popover>
  );
}
