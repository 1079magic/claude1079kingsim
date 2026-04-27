'use strict';
const nodemailer = require('nodemailer');

function getTransport() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASS,   // Gmail App Password (not account password)
    },
  });
}

async function sendVerificationCode(toEmail, code) {
  const transport = getTransport();
  await transport.sendMail({
    from: `"KingSim 1079" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: '🛡️ KingSim — Your Verification Code',
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
  });
}

module.exports = { sendVerificationCode };
