/** Shared primitive domain types. */

export type IcaoCode = string & { readonly __brand: "IcaoCode" };

export type FlightLevel = number & { readonly __brand: "FlightLevel" };

export interface GeoPoint {
  readonly latitude: number;
  readonly longitude: number;
}

export interface GeoBounds {
  readonly north: number;
  readonly south: number;
  readonly east: number;
  readonly west: number;
}

export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
