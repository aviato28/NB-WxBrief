import type { ReactNode } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { NbWxBriefMark } from "@/components/brand/nb-wxbrief-logo";
import { APP_NAME } from "@/domain/constants/app";

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
      <footer className="border-t border-border/60 py-5">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 text-center sm:px-6">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <NbWxBriefMark className="size-5" />
            <span className="font-medium tracking-tight text-foreground/80">
              {APP_NAME}
            </span>
          </div>
          <p className="max-w-2xl text-[11px] text-muted-foreground">
            Operational decision support only. Verify against official company and
            ATC weather sources. METAR/TAF/SIGMET via NOAA AWC · airports via
            OurAirports · winds aloft advisory via Open-Meteo.
          </p>
        </div>
      </footer>
    </div>
  );
}
