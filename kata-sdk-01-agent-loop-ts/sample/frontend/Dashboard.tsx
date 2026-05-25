import React from "react";

// TODO(perf): memoize the heavy chart components — measured 200ms re-render
//             on tab switches in Chrome devtools last sprint.
export function Dashboard() {
  // TODO(a11y): missing aria-label on the chart container
  return (
    <div>
      <h1>Dashboard</h1>
      {/* TODO: replace mock data with real /api/metrics fetch once backend ships */}
      <Chart data={[]} />
    </div>
  );
}

function Chart({ data }: { data: number[] }) {
  return <svg width="600" height="300">{/* ... */}</svg>;
}
