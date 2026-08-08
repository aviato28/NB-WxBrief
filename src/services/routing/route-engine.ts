import type { Airport } from "@/domain/models/airport";
import type { ParsedRoute, RouteFix } from "@/domain/models/route";
import {
  buildLegsAndSamples,
  createRouteFix,
  estimateUnresolvedFixes,
  isLikelyAirwayDesignator,
  parseLatLonToken,
  tokenizeAtcRoute,
} from "@/lib/geo";
import type { AirportProvider } from "@/services/providers/airports/airport-provider";
import { AwcNavProvider } from "@/services/routing/awc-nav-provider";
import { LocalNavaidProvider } from "@/services/routing/local-navaid-provider";

/**
 * Resolves the filed ATC route into a flyable waypoint sequence.
 * Never collapses to a single departure→destination great-circle.
 */
export class RouteEngine {
  constructor(
    private readonly airports: AirportProvider,
    private readonly nav: AwcNavProvider = new AwcNavProvider(),
    private readonly localNavaids: LocalNavaidProvider = new LocalNavaidProvider(),
  ) {}

  async resolve(
    rawRoute: string,
    departure: Airport,
    destination: Airport,
  ): Promise<ParsedRoute> {
    const tokens = tokenizeAtcRoute(rawRoute).filter(
      (token) => !isLikelyAirwayDesignator(token),
    );

    // Drop leading/trailing airport duplicates if crew included them in the route string.
    const filtered = tokens.filter(
      (token, index) =>
        !(
          (index === 0 && token === departure.icao) ||
          (index === tokens.length - 1 && token === destination.icao)
        ),
    );

    const fiveLetter = filtered.filter(
      (token) =>
        !parseLatLonToken(token) && token.length === 5 && /^[A-Z]+$/.test(token),
    );
    const fixLookups = await this.nav.lookupManyFixes(fiveLetter);

    const middle: RouteFix[] = [];
    for (let index = 0; index < filtered.length; index += 1) {
      const token = filtered[index];
      if (!token) continue;

      const latlon = parseLatLonToken(token);
      if (latlon) {
        middle.push(createRouteFix(token, index + 1, latlon, "latlon"));
        continue;
      }

      const fixHit = fixLookups.get(token);
      if (fixHit) {
        middle.push(createRouteFix(token, index + 1, fixHit, "fix"));
        continue;
      }

      // Named oceanic / enroute fixes are often 5 letters — try individual AWC lookup
      // when batch miss (e.g. partial AWC coverage).
      if (token.length === 5) {
        const single = await this.nav.lookupFix(token);
        if (single) {
          middle.push(createRouteFix(token, index + 1, single, "fix"));
          continue;
        }
      }

      if (token.length === 3 || token.length === 4) {
        const local = await this.localNavaids.lookup(token);
        if (local) {
          middle.push(createRouteFix(token, index + 1, local, "navaid"));
          continue;
        }

        const navaid = await this.nav.lookupNavaid(token);
        if (navaid) {
          middle.push(createRouteFix(token, index + 1, navaid, "navaid"));
          continue;
        }
      }

      if (token.length === 4) {
        const airport = await this.airports.lookup(token);
        if (airport) {
          middle.push(
            createRouteFix(token, index + 1, airport.coordinates, "airport"),
          );
          continue;
        }
      }

      // US 3-letter airway tokens often coincide with Kxxx airports (LAS→KLAS).
      if (token.length === 3) {
        const kAirport = await this.airports.lookup(`K${token}`);
        if (kAirport) {
          middle.push(
            createRouteFix(token, index + 1, kAirport.coordinates, "airport"),
          );
          continue;
        }

        const iataHits = await this.airports.search(token, 4);
        const exactIata = iataHits.find(
          (airport) => airport.iata?.toUpperCase() === token,
        );
        if (exactIata) {
          middle.push(
            createRouteFix(token, index + 1, exactIata.coordinates, "airport"),
          );
          continue;
        }
      }

      middle.push(createRouteFix(token, index + 1, null, "unresolved"));
    }

    const sequence = [
      createRouteFix(departure.icao, 0, departure.coordinates, "airport"),
      ...middle,
      createRouteFix(
        destination.icao,
        middle.length + 1,
        destination.coordinates,
        "airport",
      ),
    ];

    const estimated = estimateUnresolvedFixes(sequence);
    const geometry = buildLegsAndSamples(estimated);

    return {
      raw: rawRoute.trim(),
      fixes: estimated,
      unresolvedFixNames: estimated
        .filter((fix) => fix.kind === "estimated")
        .map((fix) => fix.name),
      ...geometry,
    };
  }
}
