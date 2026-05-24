import { lazy, Suspense } from "react";

const LiveMapClient = lazy(() => import("./live-map.client").then((mod) => ({ default: mod.LiveMapClient })));

export function LiveMap({
  home,
  staff,
  height = 320,
}: {
  home: { lat: number; lng: number } | null;
  staff: { lat: number; lng: number } | null;
  height?: number;
}) {
  return (
    <Suspense fallback={<div className="overflow-hidden rounded-xl border border-border bg-muted/20" style={{ height }} />}>
      <LiveMapClient home={home} staff={staff} height={height} />
    </Suspense>
  );
}
