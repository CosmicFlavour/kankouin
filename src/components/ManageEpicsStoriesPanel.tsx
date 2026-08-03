import type { Epic } from "@/hooks/useEpics";
import type { UserStory } from "@/hooks/useUserStories";
import { ManageableItemRow } from "@/components/ManageableItemRow";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ManageEpicsStoriesPanelProps {
  trigger: React.ReactNode;
  epics: Epic[];
  epicsLoading: boolean;
  epicsError: string | null;
  onRenameEpic: (epicId: string, title: string) => Promise<unknown>;
  onDeleteEpic: (epicId: string) => Promise<void>;
  userStories: UserStory[];
  storiesLoading: boolean;
  storiesError: string | null;
  onRenameUserStory: (storyId: string, title: string) => Promise<unknown>;
  onDeleteUserStory: (storyId: string) => Promise<void>;
}

export function ManageEpicsStoriesPanel({
  trigger,
  epics,
  epicsLoading,
  epicsError,
  onRenameEpic,
  onDeleteEpic,
  userStories,
  storiesLoading,
  storiesError,
  onRenameUserStory,
  onDeleteUserStory,
}: ManageEpicsStoriesPanelProps) {
  function storyLabel(story: UserStory) {
    const epicTitle = epics.find((e) => e.id === story.epic_id)?.title;
    return epicTitle ? `${epicTitle} / ${story.title}` : story.title;
  }

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="max-h-[85vh] max-w-lg overflow-y-auto"
        onEscapeKeyDown={(e) => {
          // Radix listens for Escape on `document` in the capture phase, so
          // it fires before a row's own input can handle it — without this,
          // Escape while renaming would close the whole panel instead of
          // just canceling the edit.
          if (document.activeElement instanceof HTMLInputElement) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Manage epics & user stories</DialogTitle>
        </DialogHeader>

        <div className="min-w-0 flex flex-col gap-4">
          <section className="flex flex-col gap-1">
            <h3 className="text-sm font-medium text-muted-foreground">
              Epics
            </h3>
            {epicsLoading && (
              <p className="text-xs text-muted-foreground">Loading...</p>
            )}
            {epicsError && (
              <p className="text-xs text-muted-foreground">
                Couldn't load epics: {epicsError}
              </p>
            )}
            {!epicsLoading && !epicsError && epics.length === 0 && (
              <p className="text-xs text-muted-foreground">No epics yet</p>
            )}
            {epics.map((epic) => (
              <ManageableItemRow
                key={epic.id}
                title={epic.title}
                entityLabel="Epic"
                onRename={(title) => onRenameEpic(epic.id, title)}
                onDelete={() => onDeleteEpic(epic.id)}
                confirmTitle="Delete epic?"
                confirmMessage={`Delete "${epic.title}"? Its tasks (and any user stories under it) will move back to the project — nothing is deleted.`}
              />
            ))}
          </section>

          <section className="flex flex-col gap-1">
            <h3 className="text-sm font-medium text-muted-foreground">
              User stories
            </h3>
            {storiesLoading && (
              <p className="text-xs text-muted-foreground">Loading...</p>
            )}
            {storiesError && (
              <p className="text-xs text-muted-foreground">
                Couldn't load user stories: {storiesError}
              </p>
            )}
            {!storiesLoading && !storiesError && userStories.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No user stories yet
              </p>
            )}
            {userStories.map((story) => (
              <ManageableItemRow
                key={story.id}
                title={story.title}
                displayLabel={storyLabel(story)}
                entityLabel="User story"
                onRename={(title) => onRenameUserStory(story.id, title)}
                onDelete={() => onDeleteUserStory(story.id)}
                confirmTitle="Delete user story?"
                confirmMessage={`Delete "${story.title}"? Its tasks will move back to the epic or project — nothing is deleted.`}
              />
            ))}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
