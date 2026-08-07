import type { DecodedMetar } from "@/domain/models/weather";
import { FlightCategoryBadge } from "@/components/briefing/flight-category-badge";
import { RawWeatherText } from "@/components/shared/raw-weather-text";
import {
  formatCeiling,
  formatUtc,
  formatVisibilitySm,
  formatWind,
} from "@/lib/format";

export function MetarBlock({ metar }: { readonly metar: DecodedMetar | null }) {
  if (!metar) {
    return (
      <p className="text-sm text-muted-foreground">METAR unavailable.</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <FlightCategoryBadge category={metar.flightCategory} />
        <span className="text-xs text-muted-foreground">
          Obs {formatUtc(metar.observedAt, "yyyy-MM-dd HH:mm")}Z
        </span>
      </div>
      <RawWeatherText text={metar.raw} />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        <Item label="Wind" value={formatWind(metar.wind)} />
        <Item label="Visibility" value={formatVisibilitySm(metar.visibilitySm)} />
        <Item label="Ceiling" value={formatCeiling(metar.ceilingFtAgl)} />
        <Item
          label="Temp / Dew"
          value={
            metar.temperatureC === null
              ? "—"
              : `${metar.temperatureC}°C / ${metar.dewpointC ?? "—"}°C`
          }
        />
        <Item
          label="Altimeter"
          value={
            metar.qnhHpa
              ? `${metar.qnhHpa} hPa${metar.altimeterInHg ? ` / ${metar.altimeterInHg}"` : ""}`
              : "—"
          }
        />
        <Item
          label="Weather"
          value={metar.phenomena.length ? metar.phenomena.join(" ") : "Nil"}
        />
        <Item
          label="Clouds"
          value={
            metar.clouds.length
              ? metar.clouds
                  .map((c) =>
                    c.baseFtAgl === null
                      ? c.cover
                      : `${c.cover}${String(Math.round(c.baseFtAgl / 100)).padStart(3, "0")}`,
                  )
                  .join(" ")
              : "Nil"
          }
        />
      </dl>
    </div>
  );
}

function Item({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div>
      <dt className="efb-label">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}
