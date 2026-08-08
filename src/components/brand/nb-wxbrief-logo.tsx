import { cn } from "@/lib/utils";
import { APP_NAME, APP_TAGLINE } from "@/domain/constants/app";

/** Minimal mark: radar-arc frame + NB monogram. */
export function NbWxBriefMark({
  className,
  title = APP_NAME,
}: {
  readonly className?: string;
  readonly title?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("shrink-0", className)}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <rect width="32" height="32" rx="8" fill="#0b1f33" />
      <path
        d="M7.5 23.5c0-9.1 7.4-16.5 16.5-16.5"
        fill="none"
        stroke="#4aa3ff"
        strokeWidth="1.75"
        strokeLinecap="round"
        opacity="0.9"
      />
      <path
        d="M11.5 22.5V9.5L20.5 22.5V9.5"
        fill="none"
        stroke="#e7ecf4"
        strokeWidth="2.15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="7" r="1.6" fill="#4aa3ff" />
    </svg>
  );
}

export function NbWxBriefLogo({
  className,
  markClassName,
  showTagline = false,
  compact = false,
}: {
  readonly className?: string;
  readonly markClassName?: string;
  readonly showTagline?: boolean;
  readonly compact?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <NbWxBriefMark className={cn("size-8", markClassName)} />
      <span className="flex min-w-0 flex-col leading-none">
        <span
          className={cn(
            "font-semibold tracking-tight text-foreground",
            compact ? "text-sm" : "text-lg",
          )}
        >
          <span className="text-foreground">NB</span>
          <span className="text-primary">-</span>
          <span className="text-foreground">WxBrief</span>
        </span>
        {showTagline ? (
          <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {APP_TAGLINE}
          </span>
        ) : null}
      </span>
    </span>
  );
}
