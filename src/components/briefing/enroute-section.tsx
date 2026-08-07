import type { EnrouteWeather } from "@/domain/models/weather";
import { SectionHeader } from "@/components/briefing/section-header";
import { RawWeatherText } from "@/components/shared/raw-weather-text";
import {
  CONVECTIVE_LABELS,
  TURBULENCE_LABELS,
} from "@/domain/constants/weather-styles";
import { formatUtc } from "@/lib/format";

export function EnrouteSection({
  enroute,
}: {
  readonly enroute: EnrouteWeather;
}) {
  return (
    <section className="efb-panel space-y-6 p-4 sm:p-5">
      <SectionHeader eyebrow="Enroute" title="Route weather" />

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
        <h3 className="efb-label mb-2">Winds aloft</h3>
        {enroute.windsAloft.length === 0 ? (
          <p className="text-sm text-muted-foreground">No winds samples.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-2 font-medium">Segment</th>
                  <th className="px-2 py-2 font-medium">FL</th>
                  <th className="px-2 py-2 font-medium">Wind</th>
                  <th className="px-2 py-2 font-medium">Temp</th>
                  <th className="px-2 py-2 font-medium">Shear proxy</th>
                </tr>
              </thead>
              <tbody>
                {enroute.windsAloft.map((sample) => (
                  <tr
                    key={`${sample.label}-${sample.point.latitude}`}
                    className="border-b border-border/50"
                  >
                    <td className="px-2 py-2">{sample.label}</td>
                    <td className="px-2 py-2 font-mono">
                      {sample.flightLevel}
                    </td>
                    <td className="px-2 py-2 font-mono">
                      {String(sample.windDirectionDeg).padStart(3, "0")}/
                      {sample.windSpeedKt}kt
                    </td>
                    <td className="px-2 py-2 font-mono">
                      {sample.temperatureC}°C
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

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="efb-label mb-2">Turbulence</h3>
          <ul className="space-y-2">
            {enroute.turbulence.map((item) => (
              <li
                key={item.segmentLabel}
                className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm"
              >
                <p className="font-medium">
                  {item.segmentLabel} · {TURBULENCE_LABELS[item.intensity]}
                </p>
                <p className="text-muted-foreground">{item.notes}</p>
              </li>
            ))}
          </ul>
        </div>
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
      </div>

      <div>
        <h3 className="efb-label mb-2">SIGMETs</h3>
        {enroute.sigmets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No SIGMETs matched the route corridor.
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
    </section>
  );
}
