const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { Resend } = require('resend');

admin.initializeApp();

// Set with: firebase functions:secrets:set RESEND_API_KEY
const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
// Set with: firebase functions:secrets:set FROM_EMAIL  (e.g. "EventPro <tickets@yourdomain.com>")
const FROM_EMAIL = defineSecret('FROM_EMAIL');

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

    // TODO: Generate QR server-side using 'qrcode' package to avoid leaking data to third parties
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

      // Mark on the attendee doc so admins can see what was sent
      await event.data.ref.set({
        confirmationEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
        confirmationEmailMessageId: data?.id || null,
      }, { merge: true });
    } catch (err) {
      logger.error('Failed to send confirmation email', err);
    }
  }
);

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
