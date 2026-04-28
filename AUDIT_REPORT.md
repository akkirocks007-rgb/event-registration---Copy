# EventPro Project Audit Report

**Date:** 2026-04-29
**Auditor:** Kimi Code CLI
**Scope:** Full-stack audit (React frontend, Firebase backend, Firestore rules, Cloud Functions)

---

## Executive Summary

| Category | Critical | Warning | Info |
|----------|----------|---------|------|
| Security | 14 | 4 | - |
| React/Code Quality | 8 | 12 | 140+ |
| Performance | 2 | 3 | - |
| Build/Deploy | - | 4 | - |

**Build Status:** ✅ Passes (7.87s) with chunk size warnings
**Lint Status:** ❌ 164 errors, 5 warnings

---

## 🔴 CRITICAL SECURITY ISSUES (Fix Immediately)

### 1. `.env` File Not Ignored by Git
**File:** `.gitignore` (line 13)
**Issue:** `.env` and `.env.*` are NOT in `.gitignore`. Your Firebase API keys, secrets, and configuration are at risk of being committed to git history.
**Fix:**
```gitignore
# Environment variables
.env
.env.*
*.local
```

### 2. Hardcoded Firebase API Key in Source Code
**File:** `src/pages/SuperuserDashboard.jsx` (line 161)
**Issue:** Full Firebase config with API key `AIzaSyAxp9sYBhVWRyiqyx59ujTTIRbMGDMB31M` is hardcoded in the bundle. Anyone can extract and abuse it.
**Fix:** Read from `import.meta.env.VITE_*` variables like `src/firebase.js` does.

### 3. Hardcoded Superuser Password in Client Bundle
**File:** `src/pages/Login.jsx` (line 229)
**Issue:** Fallback password `admin123` is embedded in client-side JavaScript. Any user can inspect the bundle and log in as superuser.
**Fix:** Remove the hardcoded fallback entirely. Force all authentication through Firebase Auth.

### 4. Firestore Rules: Any Authenticated User Can Read ALL Users
**File:** `firestore.rules` (line 60-61)
**Issue:** `allow read: if isAuthed();` on `/users/{userId}` exposes emails, phone numbers, roles, and parent relationships of every user to every attendee, exhibitor, and staff member.
**Fix:**
```javascript
allow read: if isSuperuser() || 
  request.auth.uid == userId || 
  (isAuthed() && resource.data.parentId == request.auth.uid);
```

### 5. Firestore Rules: Attendees Collection Completely Open
**File:** `firestore.rules` (line 99-102)
**Issue:** `allow read, create: if true;` + `allow update, delete: if isAuthed();` means:
- Anyone (unauthenticated) can read and create attendee records
- Any logged-in user can update or delete ANY attendee
**Fix:**
```javascript
match /attendees/{attendeeId} {
  allow read: if true;  // Keep public read if needed for check-in
  allow create: if true; // Keep public registration
  allow update, delete: if isSuperuser() || 
    (isAuthed() && resource.data.uid == request.auth.uid) ||
    isAnyRole(['admin', 'organizer', 'owner']);
}
```

### 6. Firestore Rules: TV Pairings Open to World
**File:** `firestore.rules` (line 134-136)
**Issue:** `allow read, write: if true;` on `tvPairings` lets anyone hijack TV displays or read pairing codes.
**Fix:**
```javascript
match /tvPairings/{pairId} {
  allow read: if isAuthed();
  allow write: if isAnyRole(['admin', 'organizer', 'owner', 'superuser']);
}
```

### 7. Firestore Rules: Superuser PII Exposed
**File:** `firestore.rules` (line 39-46)
**Issue:** `_config/superusers` and `_config/mainframe/superusers` are readable by anyone (`allow read: if true;`). Exposes superuser emails/phones for targeted attacks.
**Fix:** `allow read: if isSuperuser();`

### 8. Firestore Rules: `callerRole()` Null Pointer Crash
**File:** `firestore.rules` (line 17-19)
**Issue:** `get(...).data.role` crashes if the user document doesn't exist, causing mysterious request failures.
**Fix:** `return get(...).data?.role;` or guard with null check.

### 9. Firestore Rules: Missing `parentId` Validation
**File:** `firestore.rules` (lines 65-79)
**Issue:** Resellers, owners, organizers, and admins can create subordinate users without proving the new user belongs to them (no `parentId == request.auth.uid` validation).
**Fix:** Add `request.resource.data.parentId == request.auth.uid` to each create rule.

### 10. Firestore Rules: `tenantId` Authorization Bypass
**File:** `firestore.rules` (line 94)
**Issue:** `resource.data.tenantId == request.auth.uid` lets any user edit any event by setting the event's `tenantId` to their own UID.
**Fix:** Remove this check or validate `tenantId` against a trusted `tenants` collection.

### 11. Cloud Function Leaks Attendee Data to Third Party
**File:** `functions/index.js` (line 45)
**Issue:** Confirmation IDs are sent to `api.qrserver.com` (external, untrusted) to generate QR codes. This leaks private ticket data.
**Fix:** Generate QR codes server-side using the `qrcode` npm package, or generate them client-side.

### 12. Cloud Function: No Duplicate Email Protection
**File:** `functions/index.js` (line 80-101)
**Issue:** No idempotency check. If the function retries or the document is recreated, Resend sends duplicate emails (cost + user annoyance).
**Fix:** Add early return:
```javascript
if (attendee.confirmationEmailSentAt) return;
```

### 13. Functions Package.json Circular Dependency
**File:** `functions/package.json` (line 14)
**Issue:** `"event-registration": "file:.."` causes Firebase CLI to bundle the entire parent project (including `node_modules`, source code, `.env`) into the function artifact.
**Fix:** Remove this dependency immediately.

### 14. Firebase `analytics` Called on Potentially Undefined `app`
**File:** `src/firebase.js` (line 26)
**Issue:** `getAnalytics(app)` is outside the `try` block. If `initializeApp()` fails, `app` is `undefined` and this throws a secondary crash.
**Fix:** Move inside `try` block or guard with `if (app)`.

---

## 🟠 CRITICAL CODE QUALITY ISSUES

### 15. Undefined Function `addNotification` in AdminDashboard
**File:** `src/pages/AdminDashboard.jsx` (lines 1692, 1695)
**Issue:** `addNotification(...)` is called but never imported or defined. This will crash at runtime.
**Fix:** Import from a notification context or define the function.

### 16. Components Defined Inside Render (State Loss)
**File:** `src/components/ZoneRulesManager.jsx` (lines 189, 235)
**File:** `src/pages/WelcomeTVDesigner.jsx` (lines 45, 52)
**Issue:** `TicketGrid`, `TimeGrid`, `Avatar`, and `Badge` are defined inside the render function. React treats them as new components on every render, wiping their state and causing performance issues.
**Fix:** Move component definitions outside the parent component or inline them as JSX.

### 17. Variables Used Before Declaration
**File:** `src/pages/DeviceLogin.jsx` (lines 74, 80, 81)
**Issue:** `handlePinSubmit`, `startCamera`, and `stopCamera` are referenced in `useEffect` hooks before their `const` declarations. In JavaScript, `const` is not hoisted, so closures capture `undefined`.
**Fix:** Use `useCallback` for these functions and place them BEFORE the effects that depend on them.

### 18. Missing `.env` in `.gitignore`
**(Duplicate of #1 for emphasis)**
**File:** `.gitignore`
**Fix:** Add `.env` and `.env.*` immediately.

---

## 🟡 HIGH SEVERITY REACT ISSUES

### 19. `setState` Called Synchronously in Effects (Cascading Renders)
**Files affected (14 locations):**
- `src/components/AgendaManager.jsx:16`
- `src/components/CommandPalette.jsx:47`
- `src/components/EntryLog.jsx:67`
- `src/components/ExhibitorManager.jsx:21`
- `src/components/SpeakerManager.jsx:26`
- `src/components/ZoneRulesManager.jsx:129`
- `src/pages/AttendeePortal.jsx:91`
- `src/pages/DeviceLogin.jsx:69`
- `src/pages/DeviceManager.jsx:63`
- `src/pages/SupervisorDashboard.jsx:103`
- `src/pages/WelcomeTV.jsx:30`

**Issue:** Calling `setState` directly in `useEffect` body triggers an extra render cycle. While not a crash, it hurts performance and can cause unexpected behavior.
**Fix:** Initialize state with the value directly, or use a callback pattern. For `localStorage` reads, use a lazy initializer:
```javascript
const [speakersList, setSpeakersList] = useState(() => 
  JSON.parse(localStorage.getItem('speakers') || '[]')
);
```

### 20. `motion` Imported But Never Used (Everywhere)
**Files affected:** Nearly every component and page file.
**Issue:** Bloated imports from `framer-motion` across the codebase. While tree-shaking helps, it's messy.
**Fix:** Remove unused `motion` imports.

### 21. Fast Refresh Violations
**File:** `src/hooks/useAuth.jsx` (line 70)
**File:** `src/components/ZoneRulesManager.jsx` (lines 12, 24, 36, 49)
**Issue:** Exporting non-component values (constants, helper functions) alongside components breaks React Fast Refresh, causing full page reloads during development.
**Fix:** Move constants/helpers to separate utility files.

### 22. `Date.now()` Called During Render (Impure)
**File:** `src/pages/SuperuserDashboard.jsx` (line 346)
**Issue:** `Date.now()` is impure. Calling it during render makes the component non-idempotent and can cause hydration mismatches.
**Fix:** Use `useState` or `useMemo` to capture the current time, or move time formatting to a utility called in event handlers.

### 23. Missing `useEffect` Dependencies
**File:** `src/pages/Login.jsx` (line 30)
**Issue:** `statuses.length` missing from dependency array. Could cause stale closure bugs.
**Fix:** Add `statuses.length` to deps or use a ref.

---

## 🟡 PERFORMANCE ISSUES

### 24. Massive Bundle Chunks
**Files:** `dist/assets/AdminDashboard-BpydUBkZ.js` (628 KB), `dist/assets/createLucideIcon-CwoAMPnN.js` (504 KB)
**Issue:** AdminDashboard alone is 628 KB gzipped to 183 KB. Lucide icons chunk is 504 KB. On slow mobile networks, this is painful.
**Fix:**
- Use dynamic imports for heavy dashboard tabs
- Import Lucide icons individually instead of the whole library
- Enable `reactCompiler` or code-split heavy components further

### 25. Terser Build Time
**Issue:** Build spent significant time in `vite:terser` plugin.
**Fix:** Consider disabling terser in development builds or using `esbuild` minification for faster builds.

### 26. No `React.memo` or `useMemo` on Heavy Lists
**Observation:** Dashboards with attendee lists, scan logs, and exhibitor tables likely re-render everything on every state change.
**Fix:** Wrap list items in `React.memo` and memoize filtered/sorted arrays with `useMemo`.

---

## 🟢 MODERATE / LOW SEVERITY

### 27. Unused Variables (Dozens)
**Examples:**
- `src/pages/AdminDashboard.jsx:279` - `spatialStats` unused
- `src/pages/AdminDashboard.jsx:771` - `runHeavySimulation` unused
- `src/pages/ExhibitorDashboard.jsx:61` - `_` unused
- `src/components/ZoneRulesManager.jsx:62` - `ticketLabel` unused
- `src/components/EntryLog.jsx:46` - `setAutoRefresh` unused

**Fix:** Remove or prefix with underscore to indicate intentional unused.

### 28. Empty Catch Blocks
**Files:** `src/components/ExhibitorManager.jsx:113`, `src/pages/Jumbotron.jsx:62`, `src/components/ZoneRulesManager.jsx:138`
**Issue:** Errors are silently swallowed, making debugging impossible.
**Fix:** At minimum log the error: `catch (err) { console.error(err); }`

### 29. `LanguageSwitcher` Modifies DOM Directly
**File:** `src/components/LanguageSwitcher.jsx` (line 25)
**Issue:** `document.documentElement.dir = lang.dir` violates React's DOM ownership.
**Fix:** Move this to a `useEffect` that runs when language changes.

### 30. Cloud Function: Fallback Event ID `'1'`
**File:** `functions/index.js` (line 33)
**Issue:** `attendee.eventId || '1'` assumes event `1` exists. If not, the function fails silently.
**Fix:** Remove fallback and return early if `eventId` is missing.

### 31. ESLint Config Issues in Functions/
**File:** `functions/index.js`
**Issue:** ESLint errors on `require` and `exports` because the functions folder is linted with the frontend's ESM config.
**Fix:** Add an `.eslintignore` for `functions/` and `scratch/`, or add a separate `.eslintrc.cjs` in `functions/`.

---

## 📋 PRIORITIZED FIX CHECKLIST

### Immediate (Before any deployment)
- [ ] Add `.env` to `.gitignore`
- [ ] Remove hardcoded API key from `SuperuserDashboard.jsx`
- [ ] Remove hardcoded password `admin123` from `Login.jsx`
- [ ] Fix `firestore.rules` critical security holes (#4-#10)
- [ ] Fix `functions/package.json` circular dependency
- [ ] Fix `src/firebase.js` analytics crash
- [ ] Fix `addNotification` undefined crash in `AdminDashboard.jsx`

### This Week
- [ ] Fix components-defined-in-render issues
- [ ] Fix variables-used-before-declaration in `DeviceLogin.jsx`
- [ ] Fix `setState` in effect anti-patterns
- [ ] Add idempotency check to Cloud Function
- [ ] Replace external QR API with server-side generation
- [ ] Fix Firestore rules `callerRole()` null check

### Next Sprint
- [ ] Clean up unused imports and variables
- [ ] Bundle optimization (dynamic imports, Lucide tree-shaking)
- [ ] Add Firebase emulator configuration
- [ ] Add App Check initialization
- [ ] Empty catch block logging
- [ ] Fast refresh violations

---

*End of Audit Report*
