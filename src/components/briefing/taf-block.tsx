import type { DecodedTaf } from "@/domain/models/weather";
import { FlightCategoryBadge } from "@/components/briefing/flight-category-badge";
import { RawWeatherText } from "@/components/shared/raw-weather-text";
import { formatUtc, formatWind } from "@/lib/format";

export function TafBlock({ taf }: { readonly taf: DecodedTaf | null }) {
  if (!taf) {
    return <p className="text-sm text-muted-foreground">TAF unavailable.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Issued {formatUtc(taf.issuedAt, "yyyy-MM-dd HH:mm")}Z · valid{" "}
        {formatUtc(taf.validFrom, "ddHH")}–
        {formatUtc(taf.validTo, "ddHH")}Z
      </p>
      <RawWeatherText text={taf.raw} />
      <div className="space-y-2">
        {taf.periods.map((period) => (
          <div
            key={`${period.type}-${period.from}-${period.to}`}
            className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold tracking-wide text-primary">
                  {period.type}
                </span>
                <FlightCategoryBadge category={period.flightCategory} />
                <span className="text-[11px] text-muted-foreground">
                  {formatUtc(period.from, "ddHH")}–{formatUtc(period.to, "ddHH")}Z
                </span>
              </div>
              <p className="efb-mono text-foreground/90">
                {period.rawFragment || "—"}
              </p>
            </div>
            <div className="shrink-0 text-xs text-muted-foreground sm:text-right">
              {period.wind ? formatWind(period.wind) : "Wind unchanged"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
