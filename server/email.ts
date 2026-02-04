import nodemailer from "nodemailer";

type EmailAttachment = {
  filename: string;
  content: string | Buffer;
  contentType: string;
};

interface SendEmailParams {
  content: string;
  attachments?: EmailAttachment[];
  to: string;
  subject: string;
}

export async function sendEmailViaSmtp(params: SendEmailParams) {
  const port = parseInt(process.env.SMTP_PORT as string);
  const host = process.env.SMTP_HOST as string;
  const user = process.env.SMTP_USER as string;
  const pass = process.env.SMTP_PASS as string;
  const from = process.env.SMTP_FROM as string;
  const secure = process.env.SMTP_SECURE === "true";

  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });

  await transport.sendMail({
    from,
    to: params.to,
    subject: params.subject,
    text: params.content,
    attachments: params.attachments?.length ? params.attachments : undefined,
  });
}
