import type { EnrouteWeather } from "@/domain/models/weather";
import { SectionHeader } from "@/components/briefing/section-header";
import { RawWeatherText } from "@/components/shared/raw-weather-text";
import {
  CONVECTIVE_LABELS,
  TURBULENCE_LABELS,
  TURBULENCE_STYLES,
} from "@/domain/constants/weather-styles";
import { formatFlightLevel, formatUtc } from "@/lib/format";
import { cn } from "@/lib/utils";

export function EnrouteSection({
  enroute,
}: {
  readonly enroute: EnrouteWeather;
}) {
  const cruiseFl =
    enroute.turbulence.find((t) => t.altitudeOffsetFl === 0)?.flightLevel ??
    enroute.windsAloft.find(() => true)?.flightLevel;

  const cruiseWinds = cruiseFl
    ? enroute.windsAloft.filter((w) => w.flightLevel === cruiseFl)
    : enroute.windsAloft;

  // Group turbulence by segment for a compact ±4000 ft / 1000 ft ladder.
  const segments = Array.from(
    new Map(
      enroute.turbulence.map((t) => [t.segmentLabel, t.segmentLabel] as const),
    ).keys(),
  );

  return (
    <section className="efb-panel space-y-6 p-4 sm:p-5">
      <SectionHeader eyebrow="Enroute" title="Route weather" />

      <div>
        <h3 className="efb-label mb-2">Operational weather summary</h3>
        <ul className="space-y-2 text-sm text-foreground/90">
          {enroute.dispatchBullets.map((note) => (
            <li
              key={note}
              className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2"
            >
              • {note}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="efb-label mb-2">Weather along route</h3>
        <ul className="space-y-2 text-sm text-foreground/90">
          {enroute.alongRouteNotes.map((note) => (
            <li
              key={note}
              className="rounded-md border border-border/50 bg-muted/30 px-3 py-2"
            >
              {note}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="efb-label mb-2">
          Winds aloft
          {cruiseFl ? ` · ${formatFlightLevel(cruiseFl)} cruise` : ""}
        </h3>
        {cruiseWinds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No winds samples.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-2 font-medium">Segment</th>
                  <th className="px-2 py-2 font-medium">FL</th>
                  <th className="px-2 py-2 font-medium">Wind</th>
                  <th className="px-2 py-2 font-medium">Temp</th>
                  <th className="px-2 py-2 font-medium">Cloud</th>
                  <th className="px-2 py-2 font-medium">Shear</th>
                </tr>
              </thead>
              <tbody>
                {cruiseWinds.map((sample) => (
                  <tr
                    key={`${sample.label}-${sample.flightLevel}-${sample.point.latitude}-${sample.point.longitude}`}
                    className="border-b border-border/50"
                  >
                    <td className="px-2 py-2">{sample.label}</td>
                    <td className="px-2 py-2 font-mono">{sample.flightLevel}</td>
                    <td className="px-2 py-2 font-mono">
                      {String(sample.windDirectionDeg).padStart(3, "0")}/
                      {sample.windSpeedKt}kt
                    </td>
                    <td className="px-2 py-2 font-mono">
                      {sample.temperatureC}°C
                    </td>
                    <td className="px-2 py-2 font-mono">
                      {sample.cloudCoverPct !== null
                        ? `${sample.cloudCoverPct}%`
                        : "—"}
                    </td>
                    <td className="px-2 py-2 font-mono">
                      {sample.shearProxyKtPer1000Ft ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="efb-label mb-2">
          Turbulence briefing · cruise ±4000 ft · 1000 ft steps
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Advisory only — derived from Open-Meteo wind shear/jet cues plus route
          SIGMETs. Not a certified PIREP or GTG product; verify operationally.
          Levels are cruise ±1000/2000/3000/4000 ft.
        </p>
        <div className="space-y-3">
          {segments.map((segment) => {
            const items = enroute.turbulence
              .filter((t) => t.segmentLabel === segment)
              .slice()
              .sort((a, b) => a.altitudeOffsetFl - b.altitudeOffsetFl);
            return (
              <article
                key={segment}
                className="rounded-md border border-border/60 bg-muted/30 px-3 py-3"
              >
                <p className="mb-2 text-sm font-semibold">{segment}</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  {items.map((item) => {
                    const style = TURBULENCE_STYLES[item.intensity];
                    const isCruise = item.altitudeOffsetFl === 0;
                    return (
                      <div
                        key={`${item.segmentLabel}-${item.altitudeOffsetFl}`}
                        className={cn(
                          "rounded border px-2 py-2",
                          isCruise
                            ? "border-primary/50 bg-primary/5"
                            : "border-border/50 bg-background/40",
                        )}
                      >
                        <div className="mb-1 flex flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              "inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold",
                              style.bg,
                              style.text,
                              style.border,
                            )}
                          >
                            {TURBULENCE_LABELS[item.intensity]}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {item.flightLevelBand}
                          </span>
                        </div>
                        <pre className="efb-mono whitespace-pre-wrap text-[11px] text-foreground/90">
                          {item.pilotText}
                        </pre>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="efb-label mb-2">Convective weather</h3>
          <ul className="space-y-2">
            {enroute.convective.map((item) => (
              <li
                key={item.segmentLabel}
                className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm"
              >
                <p className="font-medium">
                  {item.segmentLabel} · {CONVECTIVE_LABELS[item.risk]}
                </p>
                <p className="text-muted-foreground">{item.notes}</p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="efb-label mb-2">SIGMETs</h3>
          {enroute.sigmets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No SIGMETs matched the route corridor for the planned window.
            </p>
          ) : (
            <div className="space-y-3">
              {enroute.sigmets.map((sigmet) => (
                <article
                  key={sigmet.id}
                  className="rounded-md border border-border/70 bg-muted/25 p-3"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-300">
                      {sigmet.hazard}
                    </span>
                    <span className="text-muted-foreground">
                      {sigmet.severity} · {formatUtc(sigmet.validFrom, "ddHH")}–
                      {formatUtc(sigmet.validTo, "ddHH")}Z
                    </span>
                  </div>
                  <p className="mb-2 text-sm">{sigmet.summary}</p>
                  <RawWeatherText text={sigmet.raw} />
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
