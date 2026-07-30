import { useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}

/**
 * SSR-safe hook to check if the component has hydrated.
 * Prevents hydration mismatch errors when accessing browser-only APIs like `window`.
 *
 * @returns `true` on the client after hydration, `false` during SSR
 *
 * @example
 * ```tsx
 * const isHydrated = useIsHydrated();
 * const searchParams = isHydrated ? new URLSearchParams(window.location.search) : null;
 * ```
 */
export function useIsHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true, // Client: always true
    () => false // Server: always false
  );
}
