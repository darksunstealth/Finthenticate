// EmailService.js
import fs from 'fs';
import nodemailer from 'nodemailer';
import path from 'path';
import mailgunTransport from 'nodemailer-mailgun-transport';
import dotenv from 'dotenv';
dotenv.config();


class EmailService {
  constructor(redisCacheManager, logger) {
    this.redisCacheManager = redisCacheManager;
    this.logger = logger;

    this.logger.info('[EmailService] Initializing EmailService instance.');

    this.mailgunApiKey = process.env.MAILGUN_API_KEY;
    if (!this.mailgunApiKey) {
      this.logger.error('[EmailService] MAILGUN_API_KEY environment variable is missing.');
      throw new Error('A variável de ambiente MAILGUN_API_KEY não está definida.');
    }

    this.mailgunDomain = process.env.MAILGUN_DOMAIN;
    if (!this.mailgunDomain) {
      this.logger.error('[EmailService] MAILGUN_DOMAIN environment variable is missing.');
      throw new Error('A variável de ambiente MAILGUN_DOMAIN não está definida.');
    }

    const auth = {
      auth: {
        api_key: this.mailgunApiKey,
        domain: this.mailgunDomain,
      },
    };

    this.transporter = nodemailer.createTransport(mailgunTransport(auth));

    import('nodemailer-express-handlebars')
      .then((module) => {
        const hbs = module.default;
        const handlebarOptions = {
          viewEngine: {
            extName: '.hbs',
            partialsDir: path.resolve('./templates/'),
            defaultLayout: false,
          },
          viewPath: path.resolve('./templates/'),
          extName: '.hbs',
        };

        this.transporter.use('compile', hbs(handlebarOptions));
        this.logger.info('[EmailService] nodemailer-express-handlebars configured successfully.');
      })
      .catch((err) => {
        this.logger.error('[EmailService] Failed to load nodemailer-express-handlebars:', err);
      });
  }

  async enqueueEmail(to, subject, template, context) {
    const emailData = { to, subject, template, context };
    this.logger.debug('[EmailService.enqueueEmail] Attempting to enqueue email:', emailData);

    try {
      await this.redisCacheManager.lpush('emailQueue', JSON.stringify(emailData));
      this.logger.info('[EmailService.enqueueEmail] Email successfully enqueued:', emailData);
    } catch (error) {
      this.logger.error('[EmailService.enqueueEmail] Failed to enqueue email:', error);
    }
  }

  async sendEmail(to, subject, template, context) {
    const mailOptions = {
      from: 'sandboxb3822bd608fc4deb8b5bdad964542564.mailgun.org',
      to,
      subject,
      template,
      context,
    };

    this.logger.debug('[EmailService.sendEmail] Preparing to send email with options:', mailOptions);

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.info('[EmailService.sendEmail] Email sent successfully:', info);
    } catch (error) {
      this.logger.error('[EmailService.sendEmail] Failed to send email:', error);
    }
  }

}

export default EmailService;