import { Resend } from "resend";

import type { BaseSendEmailParams, EmailProvider, SendEmailResult } from "../types";

type CreateResendProviderOptions = {
  apiKey: string;
  from: string;
};

export function createResendProvider(options: CreateResendProviderOptions): EmailProvider {
  const client = new Resend(options.apiKey);

  return {
    async send(params: BaseSendEmailParams): Promise<SendEmailResult> {
      try {
        const { data, error } = await client.emails.send({
          from: options.from,
          to: params.to,
          subject: params.subject,
          html: params.html,
          text: params.text,
        });

        if (error) {
          return { success: false, error };
        }

        return { success: true, data: data ?? undefined };
      } catch (error) {
        return { success: false, error };
      }
    },
  };
}
