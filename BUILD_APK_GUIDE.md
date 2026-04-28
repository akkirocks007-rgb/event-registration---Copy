# EventPro Android APK Build Guide

## Quick Answer: One APK = All 3 Roles

The simplest approach for demos and pilots is **one APK** with a login screen where users select their role:
- **Exhibitor** → Exhibitor Hub (lead capture)
- **Visitor** → Attendee Portal (3D badge, agenda, networking)
- **Scanner** → Device Login (PIN-based gate terminal)

This is what investors expect — one install, all experiences.

---

## Option 1: GitHub Actions (Easiest — No local setup)

### Step 1: Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/eventpro.git
git push -u origin main
```

### Step 2: Get your APK
1. Go to **GitHub → Actions → Build Android APK**
2. Click **Run workflow**
3. Wait ~5 minutes
4. Download `eventpro-debug-apk` artifact (contains `app-debug.apk`)

---

## Option 2: Local Build (Windows)

### Prerequisites
1. **Node.js 20+** — https://nodejs.org
2. **JDK 17** — https://adoptium.net (Eclipse Temurin)
3. **Android Studio** — https://developer.android.com/studio (installs SDK automatically)

### Set environment variables
```powershell
# Android SDK path (adjust if installed elsewhere)
[Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")

# Add to PATH
$path = [Environment]::GetEnvironmentVariable("Path", "User")
[Environment]::SetEnvironmentVariable("Path", "$path;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\cmdline-tools\latest\bin", "User")
```

### Build
```powershell
.\scripts\build-apk.ps1
```

Or manually:
```bash
npm run build
npx cap sync android
cd android
.\gradlew assembleDebug
```

APK location: `android/app/build/outputs/apk/debug/app-debug.apk`

---

## Option 3: Android Studio (GUI)

1. `npm run build`
2. `npx cap sync android`
3. `npx cap open android`
4. In Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**

---

## How to Demo Each Role on the APK

### Exhibitor
1. Open app → Select **Exhibitor Hub**
2. Login with any exhibitor account (seeded by `scratch/seed_demo_data.mjs`)
3. Scan attendee QR badges or enter confirmation ID manually
4. Rate leads (Cold/Warm/Hot), add notes

### Visitor (Attendee)
1. Open app → Select **Visitor Portal**
2. Login with email/phone of any seeded attendee
3. View 3D tilting QR badge, saved agenda, networking list
4. Tap gamification to see points

### Scanner (Gate Terminal)
1. Open app → Select **Field Staff**
2. Or directly navigate to `/device-login`
3. Enter PIN: `1111` (seeded device)
4. Enter custodian details → Take photo → Launch scanner
5. Scan any attendee QR from the Visitor Portal

---

## Future: 3 Separate Branded APKs

If you need separate Play Store listings later:

### Product Flavors (build.gradle)
Add to `android/app/build.gradle`:

```gradle
android {
    flavorDimensions += "role"
    productFlavors {
        exhibitor {
            dimension "role"
            applicationId "com.smartqrevent.exhibitor"
            resValue "string", "app_name", "SmartQR Exhibitor"
        }
        visitor {
            dimension "role"
            applicationId "com.smartqrevent.visitor"
            resValue "string", "app_name", "SmartQR Visitor"
        }
        scanner {
            dimension "role"
            applicationId "com.smartqrevent.scanner"
            resValue "string", "app_name", "SmartQR Scanner"
        }
    }
}
```

Build all three:
```bash
cd android
.\gradlew assembleExhibitorDebug assembleVisitorDebug assembleScannerDebug
```

> **Note:** For truly separate apps with different entry points, you'd need 3 Capacitor projects or custom native code to pass intent extras to the webview. For demos, one APK is strongly recommended.

---

## Release Build (Production)

For Google Play Store:

1. Generate upload key:
```bash
cd android
keytool -genkey -v -keystore eventpro-upload.keystore -alias eventpro -keyalg RSA -keysize 2048 -validity 10000
```

2. Add to `android/app/build.gradle`:
```gradle
android {
    signingConfigs {
        release {
            storeFile file("eventpro-upload.keystore")
            storePassword "YOUR_PASSWORD"
            keyAlias "eventpro"
            keyPassword "YOUR_PASSWORD"
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

3. Build:
```bash
.\gradlew bundleRelease   # .aab for Play Store
.\gradlew assembleRelease # .apk for sideloading
```

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `java not recognized` | Install JDK 17, restart PowerShell |
| `ANDROID_HOME not set` | Install Android Studio, set env var |
| `gradlew not found` | Run `npx cap add android` first |
| `SDK license not accepted` | Run `sdkmanager --licenses` in Android SDK folder |
| `Firebase config missing` | Not needed for debug builds. Copy `google-services.json` only if using native Firebase features |
| App shows white screen | Ensure `npm run build` succeeded before `npx cap sync` |
| Camera doesn't work | Grant camera permission in Android Settings → Apps |
