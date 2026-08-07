import type { Airport } from "@/domain/models/airport";
import type { IcaoCode } from "@/domain/models/common";

function icao(code: string): IcaoCode {
  return code as IcaoCode;
}

/**
 * Fixture airports for Milestone 1 only.
 * Production airport lookup will use OurAirports worldwide data — never a
 * hard-coded catalog as the source of truth.
 */
export const MOCK_AIRPORTS: Record<string, Airport> = {
  KJFK: {
    icao: icao("KJFK"),
    iata: "JFK",
    name: "John F Kennedy International Airport",
    city: "New York",
    country: "US",
    coordinates: { latitude: 40.6399, longitude: -73.7787 },
    elevationFt: 13,
    timezone: "America/New_York",
  },
  EGLL: {
    icao: icao("EGLL"),
    iata: "LHR",
    name: "London Heathrow Airport",
    city: "London",
    country: "GB",
    coordinates: { latitude: 51.4706, longitude: -0.4619 },
    elevationFt: 83,
    timezone: "Europe/London",
  },
  EIDW: {
    icao: icao("EIDW"),
    iata: "DUB",
    name: "Dublin Airport",
    city: "Dublin",
    country: "IE",
    coordinates: { latitude: 53.4213, longitude: -6.2701 },
    elevationFt: 242,
    timezone: "Europe/Dublin",
  },
  KORD: {
    icao: icao("KORD"),
    iata: "ORD",
    name: "Chicago O'Hare International Airport",
    city: "Chicago",
    country: "US",
    coordinates: { latitude: 41.9742, longitude: -87.9073 },
    elevationFt: 672,
    timezone: "America/Chicago",
  },
  KLAX: {
    icao: icao("KLAX"),
    iata: "LAX",
    name: "Los Angeles International Airport",
    city: "Los Angeles",
    country: "US",
    coordinates: { latitude: 33.9425, longitude: -118.4081 },
    elevationFt: 125,
    timezone: "America/Los_Angeles",
  },
  KSFO: {
    icao: icao("KSFO"),
    iata: "SFO",
    name: "San Francisco International Airport",
    city: "San Francisco",
    country: "US",
    coordinates: { latitude: 37.6213, longitude: -122.379 },
    elevationFt: 13,
    timezone: "America/Los_Angeles",
  },
  LFPG: {
    icao: icao("LFPG"),
    iata: "CDG",
    name: "Charles de Gaulle Airport",
    city: "Paris",
    country: "FR",
    coordinates: { latitude: 49.0097, longitude: 2.5479 },
    elevationFt: 392,
    timezone: "Europe/Paris",
  },
  EDDF: {
    icao: icao("EDDF"),
    iata: "FRA",
    name: "Frankfurt Airport",
    city: "Frankfurt",
    country: "DE",
    coordinates: { latitude: 50.0379, longitude: 8.5622 },
    elevationFt: 364,
    timezone: "Europe/Berlin",
  },
  OMDB: {
    icao: icao("OMDB"),
    iata: "DXB",
    name: "Dubai International Airport",
    city: "Dubai",
    country: "AE",
    coordinates: { latitude: 25.2532, longitude: 55.3657 },
    elevationFt: 62,
    timezone: "Asia/Dubai",
  },
  VOBL: {
    icao: icao("VOBL"),
    iata: "BLR",
    name: "Kempegowda International Airport",
    city: "Bengaluru",
    country: "IN",
    coordinates: { latitude: 13.1979, longitude: 77.7063 },
    elevationFt: 3001,
    timezone: "Asia/Kolkata",
  },
  RJTT: {
    icao: icao("RJTT"),
    iata: "HND",
    name: "Tokyo Haneda Airport",
    city: "Tokyo",
    country: "JP",
    coordinates: { latitude: 35.5494, longitude: 139.7798 },
    elevationFt: 21,
    timezone: "Asia/Tokyo",
  },
  YSSY: {
    icao: icao("YSSY"),
    iata: "SYD",
    name: "Sydney Kingsford Smith Airport",
    city: "Sydney",
    country: "AU",
    coordinates: { latitude: -33.9399, longitude: 151.1753 },
    elevationFt: 21,
    timezone: "Australia/Sydney",
  },
};

export function getMockAirport(code: string): Airport | null {
  const normalized = code.trim().toUpperCase();
  return MOCK_AIRPORTS[normalized] ?? null;
}
