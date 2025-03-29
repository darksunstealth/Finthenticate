import RedisCacheManager from '../matchingMotor/services/Redis'; // Adjust the path as needed
import EmailService from './EmailService'; // Adjust the path as needed

const emailService = new EmailService();

async function processEmailQueue() {
  while (true) {
    const emailData = await RedisCacheManager.rpop('emailQueue');
    if (emailData) {
      const { to, subject, template, context } = emailData;
      await emailService.sendEmail(to, subject, template, context);
    } else {
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds if the queue is empty
    }
  }
}

processEmailQueue().catch((err) =>
  console.error('Error processing email queue:', err),
);