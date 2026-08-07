import { cn } from "@/lib/utils";

export function RawWeatherText({
  text,
  className,
}: {
  readonly text: string;
  readonly className?: string;
}) {
  return (
    <pre
      className={cn(
        "efb-mono overflow-x-auto whitespace-pre-wrap rounded-md border border-border/70 bg-muted/60 p-3 text-foreground/95",
        className,
      )}
    >
      {text || "—"}
    </pre>
  );
}
