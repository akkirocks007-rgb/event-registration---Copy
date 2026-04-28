const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { Resend } = require('resend');
const nodemailer = require('nodemailer');
const axios = require('axios');

admin.initializeApp();

// Set with: firebase functions:secrets:set RESEND_API_KEY
const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
// Set with: firebase functions:secrets:set FROM_EMAIL  (e.g. "EventPro <tickets@yourdomain.com>")
const FROM_EMAIL = defineSecret('FROM_EMAIL');

// ── Communication Testing Configuration ──
// Set mode via: firebase functions:config:set comms.mode=ethereal
// Modes: 'ethereal' (free fake SMTP), 'textbelt' (free SMS 1/day),
//        'resend' (prod email), 'mock' (log only, default safest)
function getCommunicationMode() {
  try {
    const config = require('firebase-functions').config();
    return config.comms?.mode || 'mock';
  } catch {
    return 'mock';
  }
}

// ── Helpers: Ethereal (Free Test Email) ──
async function sendEtherealEmail({ to, subject, html, text }) {
  const testAccount = await nodemailer.createTestAccount();
  const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: { user: testAccount.user, pass: testAccount.pass },
  });

  const info = await transporter.sendMail({
    from: '"EventPro Test" <test@eventpro.dev>',
    to,
    subject,
    text,
    html,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  logger.info('Ethereal test email sent', { to, messageId: info.messageId, previewUrl });
  return { success: true, messageId: info.messageId, previewUrl, provider: 'ethereal' };
}

// ── Helpers: Textbelt (Free Test SMS - 1/day with key=textbelt) ──
async function sendTextbeltSms({ phone, message }) {
  const cleanPhone = String(phone).replace(/[^\d+]/g, '');
  if (!cleanPhone) {
    return { success: false, error: 'Invalid phone number', provider: 'textbelt' };
  }

  try {
    const { data } = await axios.post('https://textbelt.com/text', {
      phone: cleanPhone,
      message,
      key: 'textbelt', // free tier: 1 SMS per day globally
    });

    if (data.success) {
      logger.info('Textbelt SMS sent', { phone: cleanPhone, textId: data.textId });
      return { success: true, textId: data.textId, quotaRemaining: data.quotaRemaining, provider: 'textbelt' };
    }
    logger.warn('Textbelt SMS failed', { phone: cleanPhone, error: data.error });
    return { success: false, error: data.error || 'Textbelt rejected', provider: 'textbelt' };
  } catch (err) {
    logger.error('Textbelt SMS error', err.message);
    return { success: false, error: err.message, provider: 'textbelt' };
  }
}

// ── Helpers: Resend (Production Email) ──
async function sendResendEmail({ to, subject, html, fromEmail, apiKey }) {
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({ from: fromEmail, to, subject, html });
  if (error) throw error;
  return { success: true, messageId: data?.id, provider: 'resend' };
}

// ── Helpers: Templates ──
function buildOnboardingEmail({ name, email, password, role }) {
  const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : 'User';
  const html = `<!doctype html>
<html>
<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif; background:#0f172a; color:#fff; margin:0; padding:24px;">
  <div style="max-width:560px; margin:0 auto; background:#1e293b; border-radius:16px; padding:32px;">
    <h1 style="margin:0 0 8px; font-size:24px;">Welcome to EventPro, ${escapeHtml(name)}!</h1>
    <p style="color:#cbd5e1; margin:0 0 24px;">Your <b>${escapeHtml(roleLabel)}</b> account has been created.</p>

    <div style="background:#fff; color:#0f172a; border-radius:12px; padding:24px; margin:24px 0;">
      <p style="margin:0 0 4px; font-size:11px; text-transform:uppercase; letter-spacing:1.5px; color:#64748b;">Login Credentials</p>
      <p style="margin:8px 0;"><b>Email:</b> ${escapeHtml(email)}</p>
      <p style="margin:8px 0;"><b>Password:</b> <code style="background:#f1f5f9; padding:4px 8px; border-radius:6px;">${escapeHtml(password)}</code></p>
      <p style="margin:12px 0 0; font-size:13px; color:#64748b;">Please change your password after first login.</p>
    </div>

    <p style="margin:24px 0 0; font-size:12px; color:#64748b;">If you didn't expect this account, contact your system administrator.</p>
  </div>
</body>
</html>`;

  const text = `Welcome to EventPro, ${name}!\n\nYour ${roleLabel} account has been created.\n\nLogin Credentials:\nEmail: ${email}\nPassword: ${password}\n\nPlease change your password after first login.`;
  return { html, text };
}

function buildOnboardingSms({ name, email, password, role }) {
  const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : 'User';
  return `EventPro: Your ${roleLabel} account is ready!\nEmail: ${email}\nPassword: ${password}\nLogin at your dashboard.`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ═══════════════════════════════════════════════════════════════
// 1. Attendee Ticket Confirmation (existing)
// ═══════════════════════════════════════════════════════════════
exports.sendConfirmationEmail = onDocumentCreated(
  {
    document: 'attendees/{attendeeId}',
    region: 'us-central1',
    secrets: [RESEND_API_KEY, FROM_EMAIL],
  },
  async (event) => {
    const attendee = event.data?.data();
    if (!attendee) return;
    if (attendee.confirmationEmailSentAt) return;

    const email = attendee.email;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      logger.info('Skipping confirmation: no valid email', { attendeeId: event.params.attendeeId });
      return;
    }

    let eventInfo = {};
    try {
      const eventSnap = await admin.firestore()
        .collection('events').doc(attendee.eventId || '1').get();
      if (eventSnap.exists) eventInfo = eventSnap.data();
    } catch (err) {
      logger.warn('Could not load event doc', err);
    }

    const fullName = `${attendee.firstName || ''} ${attendee.lastName || ''}`.trim() || 'Attendee';
    const confirmationId = attendee.confirmationId || event.params.attendeeId;
    const eventName = eventInfo.name || eventInfo.title || 'the event';
    const eventDate = eventInfo.date || '';
    const eventLocation = eventInfo.location || '';

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(confirmationId)}`;

    const paymentNote = attendee.paymentStatus === 'pending'
      ? `<p style="margin:16px 0 0; padding:12px; background:#fef3c7; color:#92400e; border-radius:8px; font-size:13px;">
           <b>Payment due at the door</b> — please bring cash for entry.
         </p>`
      : '';

    const html = `<!doctype html>
<html>
<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif; background:#0f172a; color:#fff; margin:0; padding:24px;">
  <div style="max-width:560px; margin:0 auto; background:#1e293b; border-radius:16px; padding:32px;">
    <h1 style="margin:0 0 8px; font-size:24px;">You're registered, ${escapeHtml(fullName)}!</h1>
    <p style="color:#cbd5e1; margin:0 0 24px;">Your spot at <b>${escapeHtml(eventName)}</b> is confirmed.</p>

    <div style="background:#fff; color:#0f172a; border-radius:12px; padding:24px; margin:24px 0;">
      <p style="margin:0 0 4px; font-size:11px; text-transform:uppercase; letter-spacing:1.5px; color:#64748b;">Ticket</p>
      <p style="margin:0 0 16px; font-weight:700;">${escapeHtml(attendee.ticketName || 'General Admission')}</p>
      <div style="text-align:center;">
        <img src="${qrUrl}" alt="QR code" width="200" height="200" style="display:block; margin:0 auto;" />
        <p style="margin:12px 0 0; font-family:monospace; font-size:14px; font-weight:700; letter-spacing:1px;">${escapeHtml(confirmationId)}</p>
        <p style="margin:4px 0 0; font-size:11px; color:#64748b;">Show this QR at entry</p>
      </div>
    </div>

    ${eventDate ? `<p style="margin:0 0 4px; font-size:13px; color:#94a3b8;"><b>When:</b> ${escapeHtml(eventDate)}</p>` : ''}
    ${eventLocation ? `<p style="margin:0; font-size:13px; color:#94a3b8;"><b>Where:</b> ${escapeHtml(eventLocation)}</p>` : ''}

    ${paymentNote}

    <p style="margin:24px 0 0; font-size:12px; color:#64748b;">If you didn't sign up for this, you can ignore this email.</p>
  </div>
</body>
</html>`;

    const resend = new Resend(RESEND_API_KEY.value());
    try {
      const { data, error } = await resend.emails.send({
        from: FROM_EMAIL.value(),
        to: email,
        subject: `Your ticket for ${eventName}`,
        html,
      });
      if (error) {
        logger.error('Resend rejected the email', error);
        return;
      }
      logger.info('Confirmation email sent', { email, confirmationId, messageId: data?.id });

      await event.data.ref.set({
        confirmationEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
        confirmationEmailMessageId: data?.id || null,
      }, { merge: true });
    } catch (err) {
      logger.error('Failed to send confirmation email', err);
    }
  }
);

// ═══════════════════════════════════════════════════════════════
// 2. Onboarding Communication (Callable - for Reseller/Owner/Org/Admin creation)
// ═══════════════════════════════════════════════════════════════
exports.sendOnboardingCommunication = onCall(
  {
    region: 'us-central1',
    secrets: [RESEND_API_KEY, FROM_EMAIL],
    cors: true,
  },
  async (request) => {
    // Ensure user is authenticated
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be logged in to send onboarding communications.');
    }

    const { to, phone, name, credentials, role, channels = ['email'] } = request.data;
    if (!to || !credentials?.email || !credentials?.password) {
      throw new HttpsError('invalid-argument', 'Missing required fields: to, credentials.email, credentials.password');
    }

    const mode = getCommunicationMode();
    const results = { email: null, sms: null };
    const commsRecord = {
      to,
      phone: phone || null,
      name: name || '',
      role: role || 'user',
      type: 'onboarding',
      channels,
      mode,
      sentBy: request.auth.uid,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      results: {},
    };

    // ── Send Email ──
    if (channels.includes('email')) {
      const { html, text } = buildOnboardingEmail({ name, email: credentials.email, password: credentials.password, role });
      try {
        if (mode === 'resend') {
          results.email = await sendResendEmail({
            to,
            subject: `Your EventPro ${role || 'Account'} Credentials`,
            html,
            fromEmail: FROM_EMAIL.value(),
            apiKey: RESEND_API_KEY.value(),
          });
        } else if (mode === 'ethereal') {
          results.email = await sendEtherealEmail({ to, subject: `Your EventPro ${role || 'Account'} Credentials`, html, text });
        } else {
          // mock mode
          logger.info('[MOCK EMAIL]', { to, subject: `Your EventPro ${role || 'Account'} Credentials`, htmlLength: html.length });
          results.email = { success: true, provider: 'mock', note: 'Email logged but not sent. Set comms.mode=ethereal to test with Ethereal.email' };
        }
      } catch (err) {
        logger.error('Email send failed', err);
        results.email = { success: false, error: err.message, provider: mode };
      }
    }

    // ── Send SMS ──
    if (channels.includes('sms') && phone) {
      const message = buildOnboardingSms({ name, email: credentials.email, password: credentials.password, role });
      try {
        if (mode === 'textbelt') {
          results.sms = await sendTextbeltSms({ phone, message });
        } else {
          logger.info('[MOCK SMS]', { phone, message });
          results.sms = { success: true, provider: 'mock', note: 'SMS logged but not sent. Set comms.mode=textbelt to test with Textbelt (1 free SMS/day)' };
        }
      } catch (err) {
        logger.error('SMS send failed', err);
        results.sms = { success: false, error: err.message, provider: mode };
      }
    }

    // ── Persist to communications collection ──
    commsRecord.results = results;
    commsRecord.status = (results.email?.success || results.sms?.success) ? 'Sent' : 'Failed';
    try {
      await admin.firestore().collection('communications').add(commsRecord);
    } catch (err) {
      logger.warn('Failed to write communications log', err);
    }

    return {
      success: !!(results.email?.success || results.sms?.success),
      mode,
      results,
      message: mode === 'mock'
        ? 'Running in MOCK mode. Set firebase functions:config:set comms.mode=ethereal (or textbelt) to test real providers.'
        : 'Communication attempted.',
    };
  }
);
