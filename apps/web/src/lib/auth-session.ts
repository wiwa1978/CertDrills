import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { apiRoutes, sessionResponseSchema } from "@platform/contracts";
import { createServerSessionHelpers, normalizeBaseUrl } from "@platform/frontend-shared";

import { env } from "@/env";

const apiBaseUrl = normalizeBaseUrl(env.NEXT_PUBLIC_API_URL || env.NEXT_PUBLIC_APP_URL);

const sessionHelpers = createServerSessionHelpers({
  getHeaders: async () => {
    try {
      return new Headers({ cookie: (await cookies()).toString() });
    } catch {
      return new Headers();
    }
  },
  getSession: async (headers) => {
    try {
      const cookieHeader = headers.get("cookie");
      if (!cookieHeader) {
        return null;
      }

      const response = await fetch(`${apiBaseUrl}${apiRoutes.me.session}`, {
        method: "GET",
        headers: {
          cookie: cookieHeader,
        },
        cache: "no-store",
      });

      if (!response.ok) {
        return null;
      }

      const parsed = sessionResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        return null;
      }

      return { user: parsed.data.data };
    } catch {
      return null;
    }
  },
  redirectToLogin: () => redirect("/login"),
});

export const getCurrentSession = cache(sessionHelpers.getCurrentSession);
export const requireAuth = cache(sessionHelpers.requireAuth);
export const getServerSession = getCurrentSession;
