// Envío de correos por SMTP (por defecto Gmail con una contraseña de aplicación).
//
// Si SMTP_USER o SMTP_PASS no están configurados, no se envía nada:
// - en desarrollo, el enlace se escribe en la consola para poder probar el flujo;
// - en producción solo se registra el error (el enlace nunca va al log, porque
//   cualquiera con acceso a los logs podría usarlo).

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

const DEFAULT_SMTP_HOST = 'smtp.gmail.com';
const DEFAULT_SMTP_PORT = 465;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;
  private readonly isProduction: boolean;

  constructor(config: ConfigService) {
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');
    const port = Number(config.get<string>('SMTP_PORT') ?? DEFAULT_SMTP_PORT);

    this.isProduction = config.get<string>('NODE_ENV') === 'production';
    this.transporter =
      user && pass
        ? createTransport({
            host: config.get<string>('SMTP_HOST') || DEFAULT_SMTP_HOST,
            port,
            // 465 usa TLS desde el inicio; 587 lo activa con STARTTLS.
            secure: port === 465,
            auth: { user, pass },
          })
        : null;
    this.from = config.get<string>('MAIL_FROM') || `OrientaAI <${user ?? ''}>`;

    this.logger.log(`SMTP configurado: ${this.transporter !== null}`);
  }

  async sendPasswordReset(
    to: string,
    name: string,
    resetUrl: string,
    expiresInMinutes: number,
  ): Promise<void> {
    if (!this.transporter) {
      if (this.isProduction) {
        this.logger.error(
          'SMTP no configurado: no se pudo enviar el correo para restablecer la contraseña.',
        );
      } else {
        this.logger.warn(
          `SMTP no configurado. Enlace para restablecer la contraseña (solo en desarrollo): ${resetUrl}`,
        );
      }
      return;
    }

    const safeName = escapeHtml(name);
    const safeUrl = escapeHtml(resetUrl);

    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Restablece tu contraseña de OrientaAI',
      text: [
        `Hola, ${name}.`,
        '',
        'Recibimos una solicitud para restablecer la contraseña de tu cuenta de OrientaAI.',
        `Abre este enlace para elegir una nueva (vence en ${expiresInMinutes} minutos y sirve una sola vez):`,
        resetUrl,
        '',
        'Si no fuiste tú, ignora este correo: tu contraseña no cambiará.',
      ].join('\n'),
      html: `
        <p>Hola, ${safeName}.</p>
        <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta de OrientaAI.</p>
        <p><a href="${safeUrl}">Elegir una nueva contraseña</a></p>
        <p>El enlace vence en ${expiresInMinutes} minutos y sirve una sola vez.</p>
        <p>Si no fuiste tú, ignora este correo: tu contraseña no cambiará.</p>
      `,
    });

    // Sin el correo del destinatario: es un dato personal.
    this.logger.log('Correo para restablecer la contraseña enviado');
  }
}
