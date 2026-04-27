'use strict';

// Brevo (formerly Sendinblue) transactional email
// No domain verification needed — just a confirmed sender email
// Env vars: BREVO_API_KEY, BREVO_SENDER (optional, defaults to tipicoegon@gmail.com)

async function sendVerificationCode(toEmail, code) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error('BREVO_API_KEY env var not set');

  const senderEmail = process.env.BREVO_SENDER || 'tipicoegon@gmail.com';
  const senderName  = 'KingSim 1079';

  const payload = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: toEmail }],
    subject: 'KingSim — Your Verification Code',
    htmlContent: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0f1923;color:#e8eaf0;padding:32px;border-radius:12px;border:1px solid #2a3a52">
        <h2 style="color:#f6a435;margin:0 0 16px">KingSim 1079</h2>
        <p style="margin:0 0 24px;color:#aab4c8">Welcome, Commander. Use the code below to verify your email and complete registration.</p>
        <div style="background:#1a2a3a;border-radius:8px;padding:24px;text-align:center;margin:0 0 24px">
          <span style="font-size:2.5rem;font-weight:700;letter-spacing:0.3em;color:#f6a435">${code}</span>
        </div>
        <p style="margin:0;font-size:0.85rem;color:#667788">This code expires in 15 minutes. If you did not request this, ignore this email.</p>
      </div>
    `,
  };

  console.log('[email] Brevo sending to:', toEmail, '| from:', senderEmail);

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const responseText = await res.text();
  console.log('[email] Brevo response:', res.status, responseText);

  if (!res.ok) {
    throw new Error('Brevo ' + res.status + ': ' + responseText);
  }

  return JSON.parse(responseText);
}

module.exports = { sendVerificationCode };
