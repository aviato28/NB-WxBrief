import type { CrewOnboardBrief } from "@/domain/models/weather";
import { SectionHeader } from "@/components/briefing/section-header";

export function CrewOnboardBriefSection({
  brief,
}: {
  readonly brief: CrewOnboardBrief;
}) {
  return (
    <section className="efb-panel border-primary/30 p-4 sm:p-5">
      <SectionHeader
        eyebrow="Crew"
        title="Onboard weather brief"
        actions={
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Keep it short
          </span>
        }
      />
      <p className="mb-3 text-sm font-semibold tracking-wide text-foreground">
        {brief.headline}
      </p>
      <ul className="space-y-2.5">
        {brief.lines.map((line) => (
          <li
            key={line}
            className="rounded-md border border-border/70 bg-muted/40 px-3 py-2.5 text-sm leading-relaxed text-foreground/95"
          >
            {line}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-muted-foreground">
        A320-family timing (~430 kt planning GS, wind-biased when samples
        exist). Chop duration from enroute wind/shear samples along the filed
        route — advisory only, not a substitute for SIGMETs/PIREPs.
      </p>
    </section>
  );
}
