import type { ReactElement } from "react";
import { notFound } from "next/navigation";
import { resolveProductRoutes } from "@platform/module-contracts";

import { productWebContributions } from "@/composition/product";

type ProductRoutePageProps = {
  params: Promise<{ productRoute: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProductRoutePage({ params, searchParams }: ProductRoutePageProps) {
  const resolvedParams = await params;
  const path = `/extensions/${resolvedParams.productRoute.join("/")}`;
  const route = resolveProductRoutes(productWebContributions).find((candidate) => candidate.path === path);
  if (!route) notFound();

  return await route.render({
    params: resolvedParams,
    searchParams: await searchParams,
  }) as ReactElement;
}
