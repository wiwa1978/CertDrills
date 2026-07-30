type MaybePromise<T> = T | Promise<T>;

export type ServerSessionHelpersOptions<Session> = {
  getHeaders: () => MaybePromise<Headers>;
  getSession: (headers: Headers) => MaybePromise<Session | null>;
  redirectToLogin: () => never;
};

export type ServerSessionHelpers<Session> = {
  getCurrentSession: () => Promise<Session | null>;
  requireAuth: () => Promise<Session>;
};

export function createServerSessionHelpers<Session>({
  getHeaders,
  getSession,
  redirectToLogin,
}: ServerSessionHelpersOptions<Session>): ServerSessionHelpers<Session> {
  async function getCurrentSession() {
    return getSession(await getHeaders());
  }

  async function requireAuth() {
    const session = await getCurrentSession();
    if (session) {
      return session;
    }

    return redirectToLogin();
  }

  return { getCurrentSession, requireAuth };
}
