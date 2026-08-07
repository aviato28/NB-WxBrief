import type { Airport } from "@/domain/models/airport";
import type { AirportWeather } from "@/domain/models/weather";
import { MetarBlock } from "@/components/briefing/metar-block";
import { SectionHeader } from "@/components/briefing/section-header";
import { TafBlock } from "@/components/briefing/taf-block";
import { FlightCategoryBadge } from "@/components/briefing/flight-category-badge";

export function AirportWeatherSection({
  role,
  airport,
  weather,
}: {
  readonly role: "Departure" | "Destination" | "Alternate";
  readonly airport: Airport;
  readonly weather: AirportWeather;
}) {
  return (
    <section className="efb-panel p-4 sm:p-5">
      <SectionHeader
        eyebrow={role}
        title={`${airport.icao} · ${airport.name}`}
        actions={
          weather.metar ? (
            <FlightCategoryBadge category={weather.metar.flightCategory} />
          ) : null
        }
      />
      <p className="mb-4 text-sm text-muted-foreground">
        {[airport.city, airport.country].filter(Boolean).join(", ")}
        {airport.elevationFt !== null ? ` · elev ${airport.elevationFt} ft` : ""}
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="efb-label mb-2">METAR</h3>
          <MetarBlock metar={weather.metar} />
        </div>
        <div>
          <h3 className="efb-label mb-2">TAF</h3>
          <TafBlock taf={weather.taf} />
        </div>
      </div>

      <div className="mt-5 rounded-md border border-primary/20 bg-primary/5 p-3">
        <h3 className="efb-label mb-1 text-primary">Operational summary</h3>
        <p className="text-sm leading-relaxed text-foreground/90">
          {weather.operationalSummary}
        </p>
      </div>
    </section>
  );
}
