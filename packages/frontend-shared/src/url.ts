export function normalizeBaseUrl(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

const CONTROL_OR_BACKSLASH = /[\\\u0000-\u001f\u007f]/;

export function resolveInternalRedirect(value: string | null | undefined, fallback: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || CONTROL_OR_BACKSLASH.test(value)) {
    return fallback;
  }

  try {
    const base = new URL("https://internal.invalid");
    const resolved = new URL(value, base);
    const decodedPathname = decodeURIComponent(resolved.pathname);
    if (
      resolved.origin !== base.origin
      || !resolved.pathname.startsWith("/")
      || decodedPathname.startsWith("//")
      || CONTROL_OR_BACKSLASH.test(decodedPathname)
    ) {
      return fallback;
    }

    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}

