"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const RouteMapInner = dynamic(
  () => import("@/components/map/route-map").then((mod) => mod.RouteMap),
  {
    ssr: false,
    loading: () => <Skeleton className="h-80 w-full rounded-md sm:h-[28rem]" />,
  },
);

export function RouteMapLazy(props: ComponentProps<typeof RouteMapInner>) {
  return <RouteMapInner {...props} />;
}
