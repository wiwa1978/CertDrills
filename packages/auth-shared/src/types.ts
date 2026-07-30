import type { AuthRole } from "./roles";

export type AuthContext = {
  session: unknown;
  user: {
    id: string;
    role?: AuthRole | null;
    email?: string | null;
  };
};
