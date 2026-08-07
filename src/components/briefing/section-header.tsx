import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionHeader({
  eyebrow,
  title,
  actions,
  className,
}: {
  readonly eyebrow?: string;
  readonly title: string;
  readonly actions?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-3 flex flex-wrap items-end justify-between gap-2 border-b border-border/70 pb-2",
        className,
      )}
    >
      <div>
        {eyebrow ? <p className="efb-label mb-1">{eyebrow}</p> : null}
        <h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
          {title}
        </h2>
      </div>
      {actions}
    </div>
  );
}
