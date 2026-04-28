# EventPro Communication Testing Guide

This guide covers how to test **Email** and **SMS** onboarding flows for **Resellers, Company Owners, Event Organisers, and Admins** without spending money or sending messages to real users.

---

## ✅ What We Just Integrated

A new Cloud Function `sendOnboardingCommunication` that supports multiple modes:

| Mode | Email Provider | SMS Provider | Cost | Best For |
|------|---------------|--------------|------|----------|
| `mock` *(default)* | Logs to console only | Logs to console only | Free | Safe local dev |
| `ethereal` | [Ethereal.email](https://ethereal.email) (fake SMTP) | Logs to console | Free | Visual email testing |
| `textbelt` | Ethereal.email | [Textbelt](https://textbelt.com) | Free (1 SMS/day) | Real SMS testing |
| `resend` | Resend (production) | Logs to console | Paid | Production emails |

---

## 🚀 Quick Start (Mock Mode - Default)

**No setup required.** When you create a new Reseller/Owner/Organiser/Admin, the system runs in **mock mode** by default.

1. Go to any dashboard (Superuser, Reseller, Owner, Organiser)
2. Click **"Add"** to create a new user
3. The alert will show:
   - `Email: ⚠️ Not sent`
   - `SMS: ⚠️ Not sent`
   - `ℹ️ Running in MOCK mode`
4. Check **Firebase Functions logs** to see the full logged email HTML and SMS text.

---

## 📧 Test Emails with Ethereal.email (Free)

[Ethereal.email](https://ethereal.email) is a **fake SMTP service**. Emails are captured but never delivered to real inboxes. You get a **preview URL** to view the rendered email.

### Step 1: Set the mode

```bash
cd functions
firebase functions:config:set comms.mode=ethereal
```

> If using the **Firebase Emulator**, you can also temporarily hardcode `mode = 'ethereal'` in `functions/index.js` inside `getCommunicationMode()`.

### Step 2: Deploy the function

```bash
firebase deploy --only functions
```

### Step 3: Test

1. Create a new user from any dashboard
2. The alert will show:
   ```
   Email: ✅ Sent (Test Preview)
   🔗 https://ethereal.email/message/xxxxxx
   SMS: ⚠️ Not sent
   ```
3. **Click the preview link** to see the full HTML email with credentials

### Features
- ✅ Unlimited emails
- ✅ No signup required (auto-generated accounts)
- ✅ Shows email in browser with HTML/CSS rendering
- ✅ Provides message ID for debugging

---

## 📱 Test SMS with Textbelt (Free)

[Textbelt](https://textbelt.com) offers **1 free SMS per day** globally with `key=textbelt`.

### Step 1: Set the mode

```bash
firebase functions:config:set comms.mode=textbelt
```

### Step 2: Deploy

```bash
firebase deploy --only functions
```

### Step 3: Test

1. Create a new user with a **real phone number** (include country code, e.g. `+1234567890`)
2. The alert will show:
   ```
   Email: ✅ Sent (Test Preview)
   🔗 https://ethereal.email/message/xxxxxx
   SMS: ✅ Sent
   ```
3. Check the phone for the SMS

### Limits
- ⚠️ **1 free SMS per day** per IP address
- For more volume, you need a [paid Textbelt key](https://textbelt.com/purchase) or integrate Twilio

---

## 🔄 Switching Back to Production (Resend)

To send real emails via your existing Resend integration:

```bash
firebase functions:config:set comms.mode=resend
firebase deploy --only functions
```

> Requires `RESEND_API_KEY` and `FROM_EMAIL` secrets to be set.

---

## 🧪 Using the Firebase Emulator (Local Testing)

```bash
# Terminal 1: Start emulators
firebase emulators:start --only functions,firestore,auth

# Terminal 2: Start the React app
npm run dev
```

If you want **Ethereal previews while emulating**, edit `functions/index.js`:

```javascript
function getCommunicationMode() {
  // Force test mode during local development
  return 'ethereal';
}
```

> Remember to revert before deploying to production!

---

## 📊 Where Results Are Logged

Every communication attempt is saved to the `communications` Firestore collection:

```javascript
{
  to: "user@example.com",
  phone: "+1234567890",
  name: "John Doe",
  role: "owner",
  type: "onboarding",
  channels: ["email", "sms"],
  mode: "ethereal",
  status: "Sent",
  results: {
    email: { success: true, provider: "ethereal", previewUrl: "..." },
    sms: { success: false, provider: "textbelt", error: "..." }
  }
}
```

You can view this in the **Firebase Console > Firestore** or in the app's **Communications / Notifications** tab.

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| `Unauthorized` error when creating users | Make sure you're logged in. The Cloud Function requires authentication. |
| `Firebase Functions: config is empty` | Run `firebase functions:config:set comms.mode=ethereal` and redeploy |
| Textbelt says `Out of quota` | You've hit the 1 free SMS/day limit. Wait 24 hours or use mock mode. |
| Ethereal preview URL doesn't work | Ethereal emails expire after a few hours. Create a new user to generate a fresh preview. |
| `CORS error` in browser | The callable function has `cors: true` set. If issues persist, check your Firebase Hosting/functions region match. |

---

## 📋 Summary of Free Testing Tools

| Tool | Type | Free Tier | Signup Required? |
|------|------|-----------|------------------|
| **Ethereal.email** | Fake SMTP | Unlimited | ❌ No |
| **Textbelt** | SMS API | 1 SMS/day | ❌ No |
| **Mailinator** | Public Inbox | Unlimited | ❌ No |
| **Mailtrap** | Email Sandbox | 100 emails/mo | ✅ Yes |
| **MailSlurp** | Email + SMS API | 50 inboxes, 100 msgs/mo | ✅ Yes |

For this project, we recommend **Ethereal.email + Textbelt** for zero-cost testing, and **MailSlurp** if you need automated API-driven assertions in CI/CD.

---

## 🎯 Next Steps

- [ ] Install dependencies: `cd functions && npm install`
- [ ] Set your desired mode: `firebase functions:config:set comms.mode=ethereal`
- [ ] Deploy: `firebase deploy --only functions`
- [ ] Create a test Reseller and click the Ethereal preview link!
