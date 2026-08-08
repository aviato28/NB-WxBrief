"use client";

import { Download, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { WeatherBriefing } from "@/domain/models/briefing";

export function BriefingToolbar({
  briefing,
  onRefresh,
  isRefreshing,
}: {
  readonly briefing: WeatherBriefing;
  readonly onRefresh: () => void;
  readonly isRefreshing: boolean;
}) {
  const [exporting, setExporting] = useState(false);

  async function handleExport(): Promise<void> {
    setExporting(true);
    try {
      const [{ pdf }, { BriefingPdfDocument }, { captureBriefingMapImage }] =
        await Promise.all([
          import("@react-pdf/renderer"),
          import("@/components/briefing/briefing-pdf-document"),
          import("@/lib/pdf-map-capture"),
        ]);

      // Prefer server tile mosaic (real basemap); vector chart is the PDF fallback.
      let mapImageDataUrl: string | null = null;
      try {
        mapImageDataUrl = await Promise.race([
          captureBriefingMapImage(briefing),
          new Promise<null>((resolve) => {
            window.setTimeout(() => resolve(null), 12_000);
          }),
        ]);
      } catch (error) {
        console.warn("[pdf-export] map capture skipped:", error);
      }

      const blob = await pdf(
        <BriefingPdfDocument
          briefing={briefing}
          mapImageDataUrl={mapImageDataUrl}
        />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${briefing.summary.departure.icao}-${briefing.summary.destination.icao}-wxbrief.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" asChild>
        <Link href="/">New brief</Link>
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onRefresh}
        disabled={isRefreshing}
      >
        {isRefreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        Refresh
      </Button>
      <Button size="sm" onClick={() => void handleExport()} disabled={exporting}>
        {exporting ? <Loader2 className="animate-spin" /> : <Download />}
        {exporting ? "Building PDF…" : "Export PDF"}
      </Button>
    </div>
  );
}
