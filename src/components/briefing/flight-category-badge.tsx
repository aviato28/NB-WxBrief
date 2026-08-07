import type { FlightCategory } from "@/domain/models/flight-category";
import { FLIGHT_CATEGORY_STYLES } from "@/domain/constants/weather-styles";
import { cn } from "@/lib/utils";

export function FlightCategoryBadge({
  category,
  className,
}: {
  readonly category: FlightCategory;
  readonly className?: string;
}) {
  const styles = FLIGHT_CATEGORY_STYLES[category];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold tracking-wide",
        styles.bg,
        styles.text,
        styles.border,
        className,
      )}
    >
      {category}
    </span>
  );
}
