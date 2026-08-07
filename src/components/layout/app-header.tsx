import Link from "next/link";
import { APP_NAME, APP_TAGLINE } from "@/domain/constants/app";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="group flex items-baseline gap-3">
          <span className="text-lg font-semibold tracking-tight text-foreground group-hover:text-primary">
            {APP_NAME}
          </span>
          <span className="hidden text-xs uppercase tracking-[0.16em] text-muted-foreground sm:inline">
            {APP_TAGLINE}
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            New brief
          </Link>
        </nav>
      </div>
    </header>
  );
}
