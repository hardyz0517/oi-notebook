import { type ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";

export type SortableRenderProps = ReturnType<typeof useSortable>;

const MIN_HORIZONTAL_DRAG_OFFSET = -48;
const MAX_HORIZONTAL_DRAG_OFFSET = 96;

export function SortableItem({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: (sortable: SortableRenderProps) => ReactNode;
}) {
  const sortable = useSortable({ id, disabled });
  const verticalSortable = sortable.transform
    ? {
      ...sortable,
      transform: {
        ...sortable.transform,
        x: Math.max(MIN_HORIZONTAL_DRAG_OFFSET, Math.min(sortable.transform.x ?? 0, MAX_HORIZONTAL_DRAG_OFFSET)),
      },
    }
    : sortable;

  return <>{children(verticalSortable)}</>;
}
