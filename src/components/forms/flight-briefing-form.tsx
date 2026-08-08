"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  FLIGHT_LEVEL_STEP,
  MAX_FLIGHT_LEVEL,
  MIN_FLIGHT_LEVEL,
  flightBriefingRequestSchema,
  type FlightBriefingFormValues,
  type FlightBriefingRequestParsed,
} from "@/domain/schemas/flight-request";
import {
  defaultDepartureTimeUtc,
  flightRequestToSearchParams,
  toDatetimeLocalValue,
  toFlightRequest,
} from "@/lib/flight-request";

const DEFAULT_VALUES: FlightBriefingFormValues = {
  departureIcao: "KJFK",
  destinationIcao: "EGLL",
  alternateIcao: "EIDW",
  flightLevel: 350,
  departureTimeUtc: toDatetimeLocalValue(defaultDepartureTimeUtc()),
  flightNumber: "NB101",
  aircraftRegistration: "N101NB",
  atcRoute:
    "KJFK SHIPP LINND KINGG DOVEY 50N050W 52N040W 53N030W 53N020W MALOT GISTU LESLU EGLL",
};

export function FlightBriefingForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useForm<
    FlightBriefingFormValues,
    unknown,
    FlightBriefingRequestParsed
  >({
    resolver: zodResolver(flightBriefingRequestSchema),
    defaultValues: DEFAULT_VALUES,
    mode: "onBlur",
  });

  const onSubmit = form.handleSubmit((values) => {
    const request = toFlightRequest(values);
    const params = flightRequestToSearchParams(request);
    startTransition(() => {
      router.push(`/briefing?${params.toString()}`);
    });
  });

  return (
    <form onSubmit={onSubmit} className="efb-panel space-y-5 p-4 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="flightNumber"
          label="Flight number (optional)"
          error={form.formState.errors.flightNumber?.message}
        >
          <Input
            id="flightNumber"
            autoCapitalize="characters"
            spellCheck={false}
            className="font-mono uppercase"
            placeholder="NB101"
            {...form.register("flightNumber")}
          />
        </Field>

        <Field
          id="aircraftRegistration"
          label="Aircraft registration (optional)"
          error={form.formState.errors.aircraftRegistration?.message}
        >
          <Input
            id="aircraftRegistration"
            autoCapitalize="characters"
            spellCheck={false}
            className="font-mono uppercase"
            placeholder="N101NB"
            {...form.register("aircraftRegistration")}
          />
        </Field>

        <Field
          id="departureIcao"
          label="Departure ICAO"
          error={form.formState.errors.departureIcao?.message}
        >
          <Input
            id="departureIcao"
            autoCapitalize="characters"
            spellCheck={false}
            className="font-mono uppercase"
            aria-invalid={Boolean(form.formState.errors.departureIcao)}
            {...form.register("departureIcao")}
          />
        </Field>

        <Field
          id="destinationIcao"
          label="Destination ICAO"
          error={form.formState.errors.destinationIcao?.message}
        >
          <Input
            id="destinationIcao"
            autoCapitalize="characters"
            spellCheck={false}
            className="font-mono uppercase"
            aria-invalid={Boolean(form.formState.errors.destinationIcao)}
            {...form.register("destinationIcao")}
          />
        </Field>

        <Field
          id="flightLevel"
          label={`Cruise FL (${MIN_FLIGHT_LEVEL}–${MAX_FLIGHT_LEVEL}) · turb ±4000 ft`}
          error={form.formState.errors.flightLevel?.message}
        >
          <Input
            id="flightLevel"
            type="number"
            inputMode="numeric"
            step={FLIGHT_LEVEL_STEP}
            min={MIN_FLIGHT_LEVEL}
            max={MAX_FLIGHT_LEVEL}
            className="font-mono"
            aria-invalid={Boolean(form.formState.errors.flightLevel)}
            {...form.register("flightLevel")}
          />
        </Field>

        <Field
          id="departureTimeUtc"
          label="Departure time (UTC)"
          error={form.formState.errors.departureTimeUtc?.message}
        >
          <Input
            id="departureTimeUtc"
            type="datetime-local"
            className="font-mono"
            aria-invalid={Boolean(form.formState.errors.departureTimeUtc)}
            {...form.register("departureTimeUtc")}
          />
        </Field>

        <Field
          id="alternateIcao"
          label="Alternate ICAO (optional)"
          error={form.formState.errors.alternateIcao?.message}
        >
          <Input
            id="alternateIcao"
            autoCapitalize="characters"
            spellCheck={false}
            className="font-mono uppercase"
            placeholder="EIDW"
            aria-invalid={Boolean(form.formState.errors.alternateIcao)}
            {...form.register("alternateIcao")}
          />
        </Field>
      </div>

      <Field
        id="atcRoute"
        label="ATC route"
        error={form.formState.errors.atcRoute?.message}
      >
        <Textarea
          id="atcRoute"
          rows={4}
          spellCheck={false}
          className="efb-mono min-h-28 resize-y"
          aria-invalid={Boolean(form.formState.errors.atcRoute)}
          {...form.register("atcRoute")}
        />
      </Field>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Winds and turbulence are timed from your ETD and assessed at cruise
          FL ±4000 ft.
        </p>
        <Button
          type="submit"
          size="lg"
          disabled={pending || form.formState.isSubmitting}
          className="min-w-48"
        >
          {pending ? (
            <>
              <Loader2 className="animate-spin" />
              Preparing…
            </>
          ) : (
            "Generate Flight Brief"
          )}
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly error?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="efb-label">
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
