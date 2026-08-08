import type { FlightSummary } from "@/domain/models/briefing";
import { SectionHeader } from "@/components/briefing/section-header";
import { formatFlightLevel, formatUtc } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export function FlightSummaryPanel({
  summary,
  dataMode,
  routeRaw,
  flightNumber,
  aircraftRegistration,
}: {
  readonly summary: FlightSummary;
  readonly dataMode: "mock" | "live";
  readonly routeRaw: string;
  readonly flightNumber?: string | null;
  readonly aircraftRegistration?: string | null;
}) {
  return (
    <section className="efb-panel p-4 sm:p-5">
      <SectionHeader
        eyebrow="Flight summary"
        title={`${flightNumber ? `${flightNumber} · ` : ""}${summary.departure.icao} → ${summary.destination.icao}`}
        actions={
          <Badge variant={dataMode === "live" ? "default" : "secondary"}>
            {dataMode === "live" ? "LIVE DATA" : "MOCK DATA"}
          </Badge>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
        <SummaryItem
          label="Flight"
          value={flightNumber ?? "—"}
          hint={aircraftRegistration ?? "No registration"}
        />
        <SummaryItem
          label="Departure"
          value={`${summary.departure.icao}${summary.departure.iata ? ` / ${summary.departure.iata}` : ""}`}
          hint={summary.departure.name}
        />
        <SummaryItem
          label="Destination"
          value={`${summary.destination.icao}${summary.destination.iata ? ` / ${summary.destination.iata}` : ""}`}
          hint={summary.destination.name}
        />
        <SummaryItem
          label="Alternate"
          value={summary.alternate?.icao ?? "—"}
          hint={summary.alternate?.name ?? "Not filed"}
        />
        <SummaryItem
          label="ETD (UTC)"
          value={formatUtc(summary.departureTimeUtc, "ddHH:mm")}
          hint={formatUtc(summary.departureTimeUtc, "yyyy-MM-dd")}
        />
        <SummaryItem
          label="Cruise"
          value={formatFlightLevel(summary.flightLevel)}
          hint={`${summary.routeDistanceNm.toLocaleString()} NM · ±4000 ft turb`}
        />
        <SummaryItem
          label="Generated"
          value={formatUtc(summary.generatedAt, "ddHH:mm")}
          hint="UTC"
        />
      </div>
      <div className="mt-4 space-y-3">
        <div className="space-y-2">
          <p className="efb-label">ATC route (filed)</p>
          <p className="efb-mono rounded-md border border-border/70 bg-muted/50 p-3">
            {routeRaw}
          </p>
        </div>
        {summary.estimatedAirway &&
        summary.estimatedAirway.replace(/\s+/g, " ").trim() !==
          routeRaw.replace(/\s+/g, " ").trim().toUpperCase() ? (
          <div className="space-y-2">
            <p className="efb-label">ATC route (parsed · airways kept)</p>
            <p className="efb-mono rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
              {summary.estimatedAirway}
            </p>
            <p className="text-xs text-muted-foreground">
              Airways (e.g. J60, UL9) are retained in the sequence. Map geometry
              follows fix-to-fix great circles until airway centerlines are
              available.
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Airways in the filed string (J/V/Q/T/U routes) are kept in the
            parsed sequence — not stripped to waypoint IDs only.
          </p>
        )}
      </div>
    </section>
  );
}

function SummaryItem({
  label,
  value,
  hint,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint: string;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 transition hover:border-primary/30">
      <p className="efb-label">{label}</p>
      <p className="text-sm font-semibold tracking-wide">{value}</p>
      <p className="truncate text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
