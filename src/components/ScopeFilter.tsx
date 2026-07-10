import type { Epic } from "@/hooks/useEpics";
import type { UserStory } from "@/hooks/useUserStories";

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
