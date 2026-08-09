/** Shared application constants — no magic numbers in UI/services. */

export const APP_NAME = "NB-WxBrief";
export const APP_TAGLINE = "Airline weather briefing";

export const BRIEFING_QUERY_STALE_MS = 60_000;
export const BRIEFING_QUERY_GC_MS = 5 * 60_000;

export const MOCK_NETWORK_DELAY_MS = 650;

export const MAP_DEFAULT_ZOOM = 3;
export const MAP_ROUTE_WEIGHT = 3;

/** Sample enroute weather every N nautical miles along each route leg. */
export const ROUTE_SAMPLE_INTERVAL_NM = 40;
export const ROUTE_SAMPLE_MIN_NM = 25;
export const ROUTE_SAMPLE_MAX_NM = 50;

export const BRIEFING_CACHE_TTL_MS = 90_000;
export const UPSTREAM_CACHE_TTL_MS = 60_000;

export const PDF_PAGE_MARGIN_PT = 28;

/** Max ± offset around cruise FL for turbulence/winds (FL units; 40 = 4000 ft). */
export const TURBULENCE_ALTITUDE_OFFSET_FL = 40;

/** Step between turb/wind sample levels (FL units; 10 = 1000 ft). */
export const TURBULENCE_ALTITUDE_STEP_FL = 10;

/** Default aircraft family for timing assumptions (add more families later). */
export type BriefingAircraftFamily = "A320";

export const BRIEFING_AIRCRAFT_FAMILY: BriefingAircraftFamily = "A320";

/**
 * Typical long-range cruise groundspeed (kt) by family for timing estimates.
 * A320ceo/neo ~M0.78; ~430 kt is a practical mean GS for crew timing
 * (not TAS — winds still move block time around this).
 */
export const AIRCRAFT_FAMILY_CRUISE_GS_KT: Record<
  BriefingAircraftFamily,
  number
> = {
  A320: 430,
};

/** Assumed groundspeed (kt) for ETD → enroute sample / crew-brief timing. */
export const BRIEFING_ASSUMED_GROUNDSPEED_KT =
  AIRCRAFT_FAMILY_CRUISE_GS_KT[BRIEFING_AIRCRAFT_FAMILY];

export const DATA_SOURCE_FOOTER =
  "Sources: NOAA AWC (METAR/TAF/SIGMET/fixes) · OurAirports · Open-Meteo (winds/cloud advisory) · RainViewer (radar)";
