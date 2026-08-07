import type { ReactNode } from "react";
import { AppHeader } from "@/components/layout/app-header";

export function AppShell({
  children,
  wide = false,
}: {
  readonly children: ReactNode;
  readonly wide?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main
        className={
          wide
            ? "mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6"
            : "mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6"
        }
      >
        {children}
      </main>
      <footer className="border-t border-border/60 py-4 text-center text-[11px] text-muted-foreground">
        Operational decision support only. Verify against official company and
        ATC weather sources. METAR/TAF/SIGMET via NOAA AWC · airports via
        OurAirports · winds aloft advisory via Open-Meteo.
      </footer>
    </div>
  );
}
