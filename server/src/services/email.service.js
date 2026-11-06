const env = require('../config/env');

/**
 * Transactional email through Brevo's HTTPS API.
 *
 * Render's free plan blocks outbound SMTP (ports 25/465/587), so an SMTP
 * client such as nodemailer cannot work there. Brevo accepts the message
 * over HTTPS, which Render allows. Node 22+ has a global `fetch`, so no new
 * dependency is needed.
 */
class EmailError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'EmailError';
    this.status = status;
  }
}

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const REQUEST_TIMEOUT_MS = 10000;

function isEmailConfigured() {
  return Boolean(env.email.brevoApiKey && env.email.fromEmail);
}

async function sendEmail({ to, subject, html, text }) {
  if (!isEmailConfigured()) {
    if (env.nodeEnv === 'production') {
      throw new EmailError('Email delivery is not configured (BREVO_API_KEY / EMAIL_FROM).');
    }
    // Development convenience: show the message (and its link) in the server
    // log instead of silently dropping it. Never done in production.
    console.info(`[email] BREVO_API_KEY/EMAIL_FROM not set; would send to ${to}: ${subject}\n${text || html}`);
    return { delivered: false, reason: 'not_configured' };
  }

  let response;
  try {
    response = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': env.email.brevoApiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: env.email.fromName, email: env.email.fromEmail },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new EmailError(`Email provider unreachable: ${err.message}`);
  }

  if (!response.ok) {
    // Never echo the provider body to the client; it can contain account details.
    const body = await response.text().catch(() => '');
    throw new EmailError(`Email provider rejected the message (${response.status}): ${body.slice(0, 300)}`, response.status);
  }

  return { delivered: true };
}

module.exports = { sendEmail, isEmailConfigured, EmailError };
