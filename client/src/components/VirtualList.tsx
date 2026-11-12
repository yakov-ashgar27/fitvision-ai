/** Virtualized list (6.3.1): only the rows on screen exist in the DOM. */
import { useVirtualizer } from "@tanstack/react-virtual";
import { ReactNode, useRef } from "react";

export function VirtualList<T>({ items, rowHeight = 64, height = 480, render, empty }: { items: T[]; rowHeight?: number; height?: number; render: (item: T, i: number) => ReactNode; empty?: ReactNode }) {
  const parent = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: items.length, getScrollElement: () => parent.current, estimateSize: () => rowHeight, overscan: 6 });
  if (!items.length) return <>{empty ?? <div className="muted">אין נתונים</div>}</>;
  return (
    <div ref={parent} className="vlist" style={{ maxHeight: height }}>
      <div style={{ height: v.getTotalSize(), position: "relative" }}>
        {v.getVirtualItems().map((row) => (
          <div key={row.key} data-index={row.index} ref={v.measureElement} style={{ position: "absolute", top: 0, insetInlineStart: 0, width: "100%", transform: `translateY(${row.start}px)` }}>
            {render(items[row.index], row.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
