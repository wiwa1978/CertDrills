import type { BaseSendEmailParams, CreateEmailModuleOptions, SendEmailResult } from "./types";

export function createEmailModule(options: CreateEmailModuleOptions) {
  async function send(params: BaseSendEmailParams): Promise<SendEmailResult> {
    return options.provider.send(params);
  }

  async function sendTemplate(input: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }) {
    return send({
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
  }

  return {
    defaultFrom: options.defaultFrom,
    send,
    sendTemplate,
  };
}
