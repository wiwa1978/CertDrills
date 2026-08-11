import type { ReactElement } from "react";
import { notFound } from "next/navigation";
import { resolveProductRoutes } from "@platform/module-contracts";

import { productAdminContributions } from "@/composition/product";

type ProductAdminRoutePageProps = {
  params: Promise<{ productRoute: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProductAdminRoutePage({ params, searchParams }: ProductAdminRoutePageProps) {
  const resolvedParams = await params;
  const path = `/admin/extensions/${resolvedParams.productRoute.join("/")}`;
  const route = resolveProductRoutes(productAdminContributions).find((candidate) => candidate.path === path);
  if (!route) notFound();

  return await route.render({
    params: resolvedParams,
    searchParams: await searchParams,
  }) as ReactElement;
}
