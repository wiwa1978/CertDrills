import type { BaseSendEmailParams, EmailProvider, SendEmailResult } from "../types";

export function createSmtpProvider(): EmailProvider {
  return {
    async send(_params: BaseSendEmailParams): Promise<SendEmailResult> {
      return {
        success: false,
        error: new Error("SMTP provider is a placeholder. Implement with your SMTP library."),
      };
    },
  };
}
