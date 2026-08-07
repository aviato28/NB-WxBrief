"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { BriefingView } from "@/components/briefing/briefing-view";
import { AppShell } from "@/components/layout/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { flightRequestFromSearchParams } from "@/lib/flight-request";

function BriefingPageContent() {
  const searchParams = useSearchParams();
  const request = flightRequestFromSearchParams(
    new URLSearchParams(searchParams.toString()),
  );

  if (!request) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Invalid briefing request</AlertTitle>
        <AlertDescription className="flex flex-col gap-3">
          <span>
            The URL is missing a valid departure, destination, flight level, or
            ATC route.
          </span>
          <Button asChild variant="outline" size="sm" className="w-fit">
            <Link href="/">Return to form</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return <BriefingView request={request} />;
}

export default function BriefingPage() {
  return (
    <AppShell wide>
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        }
      >
        <BriefingPageContent />
      </Suspense>
    </AppShell>
  );
}
