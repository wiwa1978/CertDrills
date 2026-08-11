import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Removes a leading locale (e.g. /en, /fr, /nl) from a path, if present.
 * Example: /en/dashboard -> /dashboard
 */
export function stripLocaleFromPath(path: string): string {
  return path.replace(/^\/(en|fr|nl)(?=\/)/, "");
}

/**
 * Removes a leading locale (e.g. /en, /fr, /nl) from a path and returns path segments.
 * Example: /en/billing -> ["billing", "purchase"]
 * Example: /en/dashboard -> ["dashboard"]
 */
export function getPathSegments(path: string): string[] {
  const strippedPath = stripLocaleFromPath(path);
  return strippedPath
    .split("/")
    .filter(Boolean)
    .filter((segment) => segment !== "admin");
}

export const formatDate = (date: Date | string) => {
  const d = new Date(date);
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

export const formatDateTime = (date: Date | string) => {
  const d = new Date(date);
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const year = d.getFullYear();
  const hours = d.getHours().toString().padStart(2, "0");
  const minutes = d.getMinutes().toString().padStart(2, "0");
  return `${day}-${month}-${year} | ${hours}:${minutes}`;
};

export const formatTime = (date: Date | string) => {
  const d = new Date(date);
  const hours = d.getHours().toString().padStart(2, "0");
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const seconds = d.getSeconds().toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
};
