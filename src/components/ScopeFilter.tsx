import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import type { Epic } from "@/hooks/useEpics";
import type { UserStory } from "@/hooks/useUserStories";
import { Button } from "@/components/ui/button";
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
  userStories: UserStory[];
  storiesLoading: boolean;
  storiesError: string | null;
}

export function ScopeFilter({
  scope,
  onScopeChange,
  epics,
  epicsLoading,
  epicsError,
  userStories,
  storiesLoading,
  storiesError,
}: ScopeFilterProps) {
  const [open, setOpen] = useState(false);

  function isSelected(type: "epic" | "story", id: string) {
    return scope?.type === type && scope.id === id;
  }

  function selectScope(next: TaskScope) {
    onScopeChange(next);
    setOpen(false);
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
      </PopoverContent>
    </Popover>
  );
}
