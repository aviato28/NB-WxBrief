import type { ThreatItem } from "@/domain/models/weather";
import { THREAT_SEVERITY_STYLES } from "@/domain/constants/weather-styles";
import { SectionHeader } from "@/components/briefing/section-header";
import { cn } from "@/lib/utils";

export function ThreatSummaryPanel({
  threats,
}: {
  readonly threats: readonly ThreatItem[];
}) {
  return (
    <section className="efb-panel p-4 sm:p-5">
      <SectionHeader eyebrow="Threats" title="Threat summary" />
      {threats.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No significant threats identified from current products.
        </p>
      ) : (
        <ul className="space-y-2">
          {threats.map((threat) => {
            const style = THREAT_SEVERITY_STYLES[threat.severity];
            return (
              <li
                key={threat.id}
                className="flex flex-col gap-2 rounded-md border border-border/70 bg-muted/30 px-3 py-2 sm:flex-row sm:items-start"
              >
                <span
                  className={cn(
                    "inline-flex h-6 shrink-0 items-center rounded border px-2 text-[10px] font-semibold tracking-wide",
                    style.badge,
                  )}
                >
                  {style.label}
                </span>
                <div>
                  <p className="text-sm font-medium">
                    {threat.title}
                    {threat.relatedIcao ? ` · ${threat.relatedIcao}` : ""}
                  </p>
                  <p className="text-sm text-muted-foreground">{threat.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
