import { arrayMove } from "@dnd-kit/sortable";

interface OrderedItem {
  id: string;
  order_index: number;
}

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

// Resolves a drag-and-drop into the dragged item's new order_index.
//
// `fullList` is the target list, sorted by order_index. If `draggedId` is
// already one of its members (reordering within the same list), the move
// is resolved via dnd-kit's own `arrayMove` — removing the item from its
// old slot and reinserting it at `overId`'s slot — rather than always
// inserting "before" `overId`. "Before" is only correct when dragging
// upward; dragging an item down onto its very next neighbor would insert
// it back where it started, one slot short of the neighbor, so the drag
// would visibly do nothing.
//
// `overId` of `null` (dropped on the list/column itself, not an item)
// appends at the end.
export function resolveDropOrderIndex(
  fullList: OrderedItem[],
  draggedId: string,
  overId: string | null,
): number {
  const withoutDragged = fullList.filter((t) => t.id !== draggedId);

  if (overId === null) {
    return computeDropOrderIndex(withoutDragged, withoutDragged.length);
  }

  const alreadyMember = fullList.some((t) => t.id === draggedId);
  if (!alreadyMember) {
    const insertAtIndex = Math.max(
      0,
      withoutDragged.findIndex((t) => t.id === overId),
    );
    return computeDropOrderIndex(withoutDragged, insertAtIndex);
  }

  const ids = fullList.map((t) => t.id);
  const oldIndex = ids.indexOf(draggedId);
  const newIndex = ids.indexOf(overId);
  if (newIndex === -1) {
    return computeDropOrderIndex(withoutDragged, withoutDragged.length);
  }

  const moved = arrayMove(fullList, oldIndex, newIndex);
  const position = moved.findIndex((t) => t.id === draggedId);
  return computeDropOrderIndex(
    moved.filter((t) => t.id !== draggedId),
    position,
  );
}
