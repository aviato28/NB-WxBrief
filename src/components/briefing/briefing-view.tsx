"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { AirportWeatherSection } from "@/components/briefing/airport-weather-section";
import { BriefingToolbar } from "@/components/briefing/briefing-toolbar";
import { CrewOnboardBriefSection } from "@/components/briefing/crew-onboard-brief-section";
import { EnrouteSection } from "@/components/briefing/enroute-section";
import { FlightSummaryPanel } from "@/components/briefing/flight-summary-panel";
import { ThreatSummaryPanel } from "@/components/briefing/threat-summary-panel";
import { RouteMapLazy } from "@/components/map/route-map-lazy";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useBriefing } from "@/hooks/use-briefing";
import type { FlightRequest } from "@/domain/models/route";
import { BriefingApiError } from "@/services/briefing/briefing-api-client";
import { SectionHeader } from "@/components/briefing/section-header";

export function BriefingView({
  request,
}: {
  readonly request: FlightRequest;
}) {
  const query = useBriefing(request);

  if (query.isLoading) {
    return <BriefingLoadingState />;
  }

  if (query.isError || !query.data) {
    const message =
      query.error instanceof BriefingApiError
        ? query.error.message
        : query.error instanceof Error
          ? query.error.message
          : "Unable to generate briefing.";

    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Briefing failed</AlertTitle>
        <AlertDescription className="flex flex-col gap-3">
          <span>{message}</span>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="w-fit text-sm underline"
              onClick={() => void query.refetch()}
            >
              Retry
            </button>
            <Link href="/" className="w-fit text-sm underline">
              New brief
            </Link>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  const briefing = query.data;

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="efb-label">NB-WxBrief · Operational briefing</p>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {briefing.request.flightNumber
              ? `${briefing.request.flightNumber} · `
              : ""}
            {briefing.summary.departure.icao} → {briefing.summary.destination.icao}
          </h1>
        </div>
        <BriefingToolbar
          briefing={briefing}
          onRefresh={() => void query.refetch()}
          isRefreshing={query.isFetching}
        />
      </div>

      <FlightSummaryPanel
        summary={briefing.summary}
        dataMode={briefing.dataMode}
        routeRaw={briefing.route.raw}
        flightNumber={briefing.request.flightNumber}
        aircraftRegistration={briefing.request.aircraftRegistration}
      />

      <CrewOnboardBriefSection brief={briefing.enroute.crewBrief} />

      <section className="efb-panel p-4 sm:p-5">
        <SectionHeader eyebrow="Dispatch" title="Operational weather summary" />
        <ul className="space-y-2 text-sm">
          {briefing.enroute.dispatchBullets.map((bullet) => (
            <li
              key={bullet}
              className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2"
            >
              • {bullet}
            </li>
          ))}
        </ul>
      </section>

      <ThreatSummaryPanel threats={briefing.threats} />

      <AirportWeatherSection
        role="Departure"
        airport={briefing.summary.departure}
        weather={briefing.departureWeather}
      />
      <AirportWeatherSection
        role="Destination"
        airport={briefing.summary.destination}
        weather={briefing.destinationWeather}
      />
      {briefing.summary.alternate && briefing.alternateWeather ? (
        <AirportWeatherSection
          role="Alternate"
          airport={briefing.summary.alternate}
          weather={briefing.alternateWeather}
        />
      ) : null}

      <section className="efb-panel p-4 sm:p-5">
        <SectionHeader eyebrow="Enroute" title="Interactive weather map" />
        <RouteMapLazy
          departure={briefing.summary.departure}
          destination={briefing.summary.destination}
          alternate={briefing.summary.alternate}
          route={briefing.route}
          enroute={briefing.enroute}
          departureWeather={briefing.departureWeather}
          destinationWeather={briefing.destinationWeather}
          alternateWeather={briefing.alternateWeather}
        />
      </section>

      <EnrouteSection enroute={briefing.enroute} />
    </div>
  );
}

function BriefingLoadingState() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Generating operational weather briefing…
      </div>
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-56 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
