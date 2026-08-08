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

/**
 * Resolves the filed ATC route into a flyable waypoint sequence.
 * Never collapses to a single departure→destination great-circle.
 */
export class RouteEngine {
  constructor(
    private readonly airports: AirportProvider,
    private readonly nav: AwcNavProvider = new AwcNavProvider(),
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

    const fixLookups = await this.nav.lookupManyFixes(
      filtered.filter(
        (token) => !parseLatLonToken(token) && token.length >= 3 && token.length <= 5,
      ),
    );

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

      if (token.length === 3 || token.length === 4) {
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
