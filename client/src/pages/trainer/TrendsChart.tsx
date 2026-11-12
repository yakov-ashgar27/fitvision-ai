/** Trends chart (US-17). Recharts lives only in trainer chunks (6.3.1). */
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Trends } from "../../api/types";

const COLORS = ["#1d4ed8", "#b45309", "#15803d", "#7c3aed"];

export default function TrendsChart({ data, metric }: { data: Trends; metric: "score" | "rom" }) {
  const weeks = [...new Set(data.exercises.flatMap((e) => e.points.map((p) => p.week)))].sort();
  const rows = weeks.map((w) => {
    const row: Record<string, number | string | null> = { week: w.slice(5).split("-").reverse().join("/") };
    for (const e of data.exercises) row[e.name] = e.points.find((p) => p.week === w)?.[metric] ?? null;
    return row;
  });
  if (!rows.length) return <div className="muted">אין נתונים בתקופה הזו</div>;
  return (
    <div style={{ width: "100%", height: 260, direction: "ltr" }}>
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="week" reversed />
          <YAxis domain={metric === "score" ? [0, 100] : ["auto", "auto"]} orientation="right" />
          <Tooltip />
          <Legend />
          {data.exercises.map((e, i) => (
            <Line key={e.exercise_id} type="monotone" dataKey={e.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} connectNulls dot />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
