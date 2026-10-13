import { arrayMove } from "@dnd-kit/sortable";

// Fractional ranking: the dragged task's new order_index is the midpoint
// of its new neighbors, so persisting a drag is a single-row update
// instead of renumbering every sibling.
export function computeDropOrderIndex(
  siblings: { order_index: number }[],
  insertAtIndex: number,
): number {
  const prev = siblings[insertAtIndex - 1];
  const next = siblings[insertAtIndex];
  if (prev && next) return (prev.order_index + next.order_index) / 2;
  if (prev) return prev.order_index + 1;
  if (next) return next.order_index - 1;
  return 0;
}

export interface PreviewDragOverOptions<T> {
  // Is `id` a container (e.g. an empty Kanban column) rather than an item?
  isContainer: (id: string) => boolean;
  containerOf: (item: T) => string;
  withContainer: (item: T, container: string) => T;
}

// Resolves one onDragOver tick into the array's new order, for animating
// items into place live while a drag is still in progress (see
// TaskBoard's/TodayView's onDragOver — this is what both call).
//
// Reordering within the same container uses dnd-kit's `arrayMove`, with
// both the dragged item's and the hovered item's index read from `items`
// *before* anything is removed. That matters: removing the dragged item
// first and then searching for the hovered item's index (as the
// cross-container branch below does, because there it's the only option)
// shifts a later hovered item's index down by one and throws away the
// direction cue — the move then always inserts "before" the hovered item,
// which is correct for dragging up but undershoots by one slot when
// dragging down (this bug shipped twice: see commit history).
//
// Crossing into a different container (or dropping on an empty one) has
// no prior position to read a direction from, so it just inserts the item
// — before the hovered item if hovering one, or at the end of that
// container's run if dropped on the container itself.
export function previewDragOver<T extends { id: string }>(
  items: T[],
  draggedId: string,
  overId: string,
  options: PreviewDragOverOptions<T>,
): T[] {
  const dragged = items.find((t) => t.id === draggedId);
  if (!dragged) return items;

  const droppedOnContainer = options.isContainer(overId);
  const overItem = items.find((t) => t.id === overId);
  const targetContainer = droppedOnContainer
    ? overId
    : (overItem ? options.containerOf(overItem) : options.containerOf(dragged));

  if (!droppedOnContainer && targetContainer === options.containerOf(dragged)) {
    const oldIndex = items.findIndex((t) => t.id === draggedId);
    const newIndex = items.findIndex((t) => t.id === overId);
    if (newIndex === -1) return items;
    return arrayMove(items, oldIndex, newIndex);
  }

  const without = items.filter((t) => t.id !== draggedId);
  let insertAt: number;
  if (droppedOnContainer) {
    const lastIdx = without
      .map((t) => options.containerOf(t))
      .lastIndexOf(targetContainer);
    insertAt = lastIdx === -1 ? without.length : lastIdx + 1;
  } else {
    insertAt = without.findIndex((t) => t.id === overId);
    if (insertAt === -1) insertAt = without.length;
  }

  const next = [...without];
  next.splice(insertAt, 0, options.withContainer(dragged, targetContainer));
  return next;
}
