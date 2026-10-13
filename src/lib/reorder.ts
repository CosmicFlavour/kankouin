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
