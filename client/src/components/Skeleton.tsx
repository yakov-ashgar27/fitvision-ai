/** Skeleton screens (6.3.1): the final layout in grey blocks, so nothing jumps when data arrives. */
export function SkeletonBlock({ h = 16, w = "100%", r = 8 }: { h?: number; w?: number | string; r?: number }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: r }} aria-hidden="true" />;
}

export function SkeletonCards({ n = 4 }: { n?: number }) {
  return (
    <div className="kpis" aria-busy="true" aria-label="טוען">
      {Array.from({ length: n }, (_, i) => (
        <div className="card" key={i}>
          <SkeletonBlock h={12} w="60%" />
          <div style={{ height: 8 }} />
          <SkeletonBlock h={28} w="40%" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonRows({ n = 6 }: { n?: number }) {
  return (
    <div className="card" aria-busy="true" aria-label="טוען">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} style={{ padding: "10px 0" }}>
          <SkeletonBlock h={14} />
        </div>
      ))}
    </div>
  );
}
