import { useState } from "react";
import { Trash2Icon } from "lucide-react";
import { confirm } from "@tauri-apps/plugin-dialog";
import type { Epic } from "@/hooks/useEpics";
import type { UserStory } from "@/hooks/useUserStories";
import { Button } from "@/components/ui/button";

export type TaskScope =
  | { type: "epic"; id: string }
  | { type: "story"; id: string }
  | null;

interface ScopeFilterProps {
  scope: TaskScope;
  onScopeChange: (scope: TaskScope) => void;
  epics: Epic[];
  epicsLoading: boolean;
  epicsError: string | null;
  onDeleteEpic: (epicId: string) => Promise<void>;
  userStories: UserStory[];
  storiesLoading: boolean;
  storiesError: string | null;
  onDeleteUserStory: (storyId: string) => Promise<void>;
}

export function ScopeFilter({
  scope,
  onScopeChange,
  epics,
  epicsLoading,
  epicsError,
  onDeleteEpic,
  userStories,
  storiesLoading,
  storiesError,
  onDeleteUserStory,
}: ScopeFilterProps) {
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Both selects derive from the single `scope` value rather than tracking
  // their own state, so picking a story always keeps the epic select in
  // sync with that story's parent epic.
  const selectedEpicId =
    scope?.type === "epic"
      ? scope.id
      : scope?.type === "story"
        ? (userStories.find((s) => s.id === scope.id)?.epic_id ?? "")
        : "";
  const selectedStoryId = scope?.type === "story" ? scope.id : "";

  function handleEpicChange(epicId: string) {
    onScopeChange(epicId ? { type: "epic", id: epicId } : null);
  }

  function handleStoryChange(storyId: string) {
    if (storyId) {
      onScopeChange({ type: "story", id: storyId });
    } else {
      // Clearing the story falls back to the epic scope if one is implied,
      // rather than resetting the whole filter.
      onScopeChange(
        selectedEpicId ? { type: "epic", id: selectedEpicId } : null,
      );
    }
  }

  async function handleDeleteEpic() {
    if (!selectedEpicId) return;
    setDeleteError(null);
    const epic = epics.find((e) => e.id === selectedEpicId);
    const confirmed = await confirm(
      `Delete "${epic?.title ?? "this epic"}"? Its tasks (and any user stories under it) will move back to the project — nothing is deleted.`,
      { title: "Delete epic?", kind: "warning" },
    );
    if (!confirmed) return;
    try {
      await onDeleteEpic(selectedEpicId);
    } catch (err) {
      setDeleteError(String(err));
    }
  }

  async function handleDeleteStory() {
    if (!selectedStoryId) return;
    setDeleteError(null);
    const story = userStories.find((s) => s.id === selectedStoryId);
    const confirmed = await confirm(
      `Delete "${story?.title ?? "this user story"}"? Its tasks will move back to the epic or project — nothing is deleted.`,
      { title: "Delete user story?", kind: "warning" },
    );
    if (!confirmed) return;
    try {
      await onDeleteUserStory(selectedStoryId);
    } catch (err) {
      setDeleteError(String(err));
    }
  }

  const storyOptions = selectedEpicId
    ? userStories.filter((s) => s.epic_id === selectedEpicId)
    : userStories;

  function storyLabel(story: UserStory) {
    if (selectedEpicId) return story.title;
    const epicTitle = epics.find((e) => e.id === story.epic_id)?.title;
    return epicTitle ? `${epicTitle} / ${story.title}` : story.title;
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <select
        value={selectedEpicId}
        onChange={(e) => handleEpicChange(e.target.value)}
        className="rounded-md border border-border bg-background px-2 py-1"
      >
        <option value="">All epics</option>
        {epics.map((epic) => (
          <option key={epic.id} value={epic.id}>
            {epic.title}
          </option>
        ))}
      </select>
      {selectedEpicId && scope?.type === "epic" && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title="Delete epic"
          onClick={handleDeleteEpic}
        >
          <Trash2Icon />
          <span className="sr-only">Delete epic</span>
        </Button>
      )}

      <select
        value={selectedStoryId}
        onChange={(e) => handleStoryChange(e.target.value)}
        className="rounded-md border border-border bg-background px-2 py-1"
      >
        <option value="">All user stories</option>
        {storyOptions.map((story) => (
          <option key={story.id} value={story.id}>
            {storyLabel(story)}
          </option>
        ))}
      </select>
      {selectedStoryId && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title="Delete user story"
          onClick={handleDeleteStory}
        >
          <Trash2Icon />
          <span className="sr-only">Delete user story</span>
        </Button>
      )}

      {deleteError && (
        <span className="text-xs text-destructive">{deleteError}</span>
      )}

      {(epicsLoading || storiesLoading) && (
        <span className="text-xs text-muted-foreground">Loading...</span>
      )}
      {epicsError && (
        <span className="text-xs text-muted-foreground">
          Couldn't load epics: {epicsError}
        </span>
      )}
      {storiesError && (
        <span className="text-xs text-muted-foreground">
          Couldn't load user stories: {storiesError}
        </span>
      )}
    </div>
  );
}
