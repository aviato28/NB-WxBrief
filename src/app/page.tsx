import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { FlightBriefingForm } from "@/components/forms/flight-briefing-form";
import { APP_NAME } from "@/domain/constants/app";

export const metadata: Metadata = {
  title: "New briefing",
  description: `Create an airline weather briefing with ${APP_NAME}.`,
};

export default function HomePage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-2">
          <p className="efb-label">NB-WxBrief</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Flight weather briefing
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
            Enter the filed route and generate a tablet-optimized operational
            brief: terminal METAR/TAF, SIGMETs, winds aloft, turbulence cues,
            and a prioritized threat summary.
          </p>
        </div>
        <FlightBriefingForm />
      </div>
    </AppShell>
  );
}
