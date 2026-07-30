export type BaseSendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type SendEmailResult =
  | { success: true; data?: { id: string } }
  | { success: false; error: unknown };

export type EmailProvider = {
  send(params: BaseSendEmailParams): Promise<SendEmailResult>;
};

export type CreateEmailModuleOptions = {
  provider: EmailProvider;
  defaultFrom: string;
};
