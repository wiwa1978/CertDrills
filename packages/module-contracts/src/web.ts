import type { CapabilityKey } from "./api";

export type NavigationContribution = {
  id: string;
  href: `/${string}`;
  labelKey: string;
  iconKey?: string;
  requiredCapability?: CapabilityKey;
  order?: number;
};

export type ProductRouteContext = {
  params: Readonly<Record<string, string | readonly string[]>>;
  searchParams: Readonly<Record<string, string | readonly string[] | undefined>>;
};

export type ProductRouteContribution<TResult = unknown> = {
  id: string;
  path: `/${string}`;
  render(context: ProductRouteContext): TResult | Promise<TResult>;
  requiredCapability?: CapabilityKey;
};

export type ProductMessageBundle = Record<string, unknown>;

export type PlatformWebContribution = {
  id: string;
  navigation?: readonly NavigationContribution[];
  routes?: readonly ProductRouteContribution[];
  messages?: Partial<Record<"en" | "nl" | "fr", ProductMessageBundle>>;
};

function isMessageObject(value: unknown): value is ProductMessageBundle {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeMessageBundle(target: ProductMessageBundle, source: ProductMessageBundle) {
  for (const [key, value] of Object.entries(source)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    const current = target[key];
    target[key] = isMessageObject(current) && isMessageObject(value)
      ? mergeMessageBundle({ ...current }, value)
      : value;
  }
  return target;
}

export function resolveProductRoutes(
  contributions: readonly PlatformWebContribution[],
  capabilities: readonly CapabilityKey[] = [],
) {
  const granted = new Set(capabilities);
  const routes = contributions.flatMap((contribution) => contribution.routes ?? [])
    .filter((route) => !route.requiredCapability || granted.has(route.requiredCapability));
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const route of routes) {
    if (route.path === "/" || route.path.endsWith("/")) {
      throw new Error(`Product route ${route.id} must use a non-root path without a trailing slash`);
    }
    if (ids.has(route.id)) throw new Error(`Duplicate product route id: ${route.id}`);
    if (paths.has(route.path)) throw new Error(`Duplicate product route path: ${route.path}`);
    ids.add(route.id);
    paths.add(route.path);
  }
  return routes;
}

export function mergeProductMessages(
  base: ProductMessageBundle,
  contributions: readonly PlatformWebContribution[],
  locale: "en" | "nl" | "fr",
) {
  return contributions.reduce(
    (messages, contribution) => contribution.messages?.[locale]
      ? mergeMessageBundle(messages, contribution.messages[locale])
      : messages,
    { ...base },
  );
}

export function resolveProductNavigation(
  contributions: readonly PlatformWebContribution[],
  capabilities: readonly CapabilityKey[] = [],
) {
  const granted = new Set(capabilities);
  const items = contributions.flatMap((contribution) => contribution.navigation ?? [])
    .filter((item) => !item.requiredCapability || granted.has(item.requiredCapability))
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
  const ids = new Set<string>();
  const hrefs = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`Duplicate navigation contribution id: ${item.id}`);
    if (hrefs.has(item.href)) throw new Error(`Duplicate navigation contribution href: ${item.href}`);
    ids.add(item.id);
    hrefs.add(item.href);
  }
  return items;
}
