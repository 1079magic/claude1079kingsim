'use strict';

async function sendVerificationCode(toEmail, code) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY env var not set');

  // Use plain onboarding@resend.dev — angle bracket format can be rejected
  // if the domain isn't verified in Resend
  const from = process.env.RESEND_FROM || 'onboarding@resend.dev';

  const payload = {
    from,
    to: [toEmail],
    subject: 'KingSim — Your Verification Code',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0f1923;color:#e8eaf0;padding:32px;border-radius:12px;border:1px solid #2a3a52">
        <h2 style="color:#f6a435;margin:0 0 16px">KingSim 1079</h2>
        <p style="margin:0 0 24px;color:#aab4c8">Welcome, Commander. Use the code below to verify your email.</p>
        <div style="background:#1a2a3a;border-radius:8px;padding:24px;text-align:center;margin:0 0 24px">
          <span style="font-size:2.5rem;font-weight:700;letter-spacing:0.3em;color:#f6a435">${code}</span>
        </div>
        <p style="margin:0;font-size:0.85rem;color:#667788">Expires in 15 minutes. If you did not request this, ignore this email.</p>
      </div>
    `,
  };

  console.log('[email] Sending to:', toEmail, '| from:', from, '| apiKey starts with:', apiKey.slice(0,6));

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const responseText = await res.text();
  console.log('[email] Resend response status:', res.status, '| body:', responseText);

  if (!res.ok) {
    throw new Error('Resend ' + res.status + ': ' + responseText);
  }

  return JSON.parse(responseText);
}

module.exports = { sendVerificationCode };
