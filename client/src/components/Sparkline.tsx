/** Tiny inline SVG chart for the trainee screens (keeps Recharts out of the trainee bundle, 6.3.1). */
export function Sparkline({ values, height = 56 }: { values: number[]; height?: number }) {
  if (values.length < 2) return <div className="muted small">אין עדיין מספיק אימונים לגרף</div>;
  const w = 300;
  const min = Math.min(...values, 0), max = Math.max(...values, 100);
  const x = (i: number) => w - (i / (values.length - 1)) * w; // time runs right to left
  const y = (v: number) => height - ((v - min) / (max - min || 1)) * (height - 6) - 3;
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} role="img" aria-label="ציון טכניקה לאורך זמן">
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" />
      {values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={3} fill="var(--accent)" />
      ))}
    </svg>
  );
}
