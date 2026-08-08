import Link from "next/link";
import { NbWxBriefLogo } from "@/components/brand/nb-wxbrief-logo";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="group rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <NbWxBriefLogo
            showTagline
            markClassName="size-8 transition group-hover:opacity-90"
            className="gap-2.5"
          />
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
