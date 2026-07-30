import type { CreateMobileAuthClientOptions } from "./types";

export function createMobileAuthClient(options: CreateMobileAuthClientOptions) {
  return {
    async login(email: string, password: string) {
      const response = await fetch(`${options.baseURL}/auth/mobile/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      return response.json();
    },

    async refresh(refreshToken: string) {
      const response = await fetch(`${options.baseURL}/auth/mobile/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken }),
      });

      return response.json();
    },

    async revoke(refreshToken: string) {
      const response = await fetch(`${options.baseURL}/auth/mobile/revoke`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken }),
      });

      return response.json();
    },
  };
}
