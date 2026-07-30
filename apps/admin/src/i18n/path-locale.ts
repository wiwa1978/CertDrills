import { routing, type Locale } from "./routing";

export function getPathLocale(pathname: string): {
  activeLocale: Locale;
  pathWithoutLocale: string;
} {
  const [, firstSegment] = pathname.split("/");
  const hasLocale = routing.locales.includes(firstSegment as Locale);
  const activeLocale = hasLocale ? (firstSegment as Locale) : routing.defaultLocale;
  const pathWithoutLocale = hasLocale
    ? pathname.slice(firstSegment.length + 1) || "/"
    : pathname;

  return { activeLocale, pathWithoutLocale };
}
