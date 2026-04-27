'use strict';

// Uses Resend API (https://resend.com) — no npm package needed, pure fetch.
// Set env var: RESEND_API_KEY=re_xxxxxxxxxxxx
// Sender: configure RESEND_FROM in Netlify env, e.g. "KingSim <onboarding@resend.dev>"

async function sendVerificationCode(toEmail, code) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY env var not set');

  const from = process.env.RESEND_FROM || 'KingSim 1079 <onboarding@resend.dev>';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [toEmail],
      subject: 'KingSim — Your Verification Code',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0f1923;color:#e8eaf0;padding:32px;border-radius:12px;border:1px solid #2a3a52">
          <h2 style="color:#f6a435;margin:0 0 16px">KingSim 1079</h2>
          <p style="margin:0 0 24px;color:#aab4c8">Welcome, Commander. Use the code below to verify your email and complete registration.</p>
          <div style="background:#1a2a3a;border-radius:8px;padding:24px;text-align:center;margin:0 0 24px">
            <span style="font-size:2.5rem;font-weight:700;letter-spacing:0.3em;color:#f6a435">${code}</span>
          </div>
          <p style="margin:0;font-size:0.85rem;color:#667788">This code expires in 15 minutes. If you did not request this, ignore this email.</p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error('Resend API error ' + res.status + ': ' + body);
  }

  return res.json();
}

module.exports = { sendVerificationCode };
