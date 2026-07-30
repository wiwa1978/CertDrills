"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { getPathSegments } from "@/lib/utils";
import Link from "next/link";

function formatSegment(segment: string) {
  return segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function BreadcrumbPageClient() {
  const path = usePathname();
  const t = useTranslations('breadcrumb');

  const segments = getPathSegments(path);

  // If no segments, default to dashboard
  if (segments.length === 0) {
    return (
      <BreadcrumbItem>
        <BreadcrumbPage className="text-foreground text-sm font-medium">
          {t('dashboard')}
        </BreadcrumbPage>
      </BreadcrumbItem>
    );
  }

  return (
    <>
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        
        // Check if segment is a UUID (skip translation for UUIDs)
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment);
        
        const translated = isUUID ? 'user' : t(segment, { fallback: formatSegment(segment) });
        const capitalized = translated.charAt(0).toUpperCase() + translated.slice(1);
        
        // Build the path for this segment
        const segmentPath = '/' + segments.slice(0, index + 1).join('/');

        if (isLast) {
          // Last segment - render as page (not clickable)
          return (
            <BreadcrumbItem key={segment}>
              <BreadcrumbPage className="text-foreground text-sm font-medium">
                {capitalized}
              </BreadcrumbPage>
            </BreadcrumbItem>
          );
        } else {
          // Not last segment - render as link
          return (
            <div key={segment} className="flex items-center">
              <BreadcrumbItem>
                <BreadcrumbLink 
                  href={segmentPath}
                  className="text-muted-foreground hover:text-foreground text-sm font-medium"
                >
                  {capitalized}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="text-muted-foreground" />
            </div>
          );
        }
      })}
    </>
  );
}
