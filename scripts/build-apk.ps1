# EventPro Android APK Builder
# Requires: Node.js 20+, Android Studio (or JDK 17 + Android SDK), Java
#
# Run: .\scripts\build-apk.ps1

$ErrorActionPreference = "Stop"

Write-Host "🔧 EventPro APK Builder" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan

# Check Node
$nodeVer = node -v
Write-Host "✅ Node.js: $nodeVer"

# Check Java
try {
    $javaVer = java -version 2>&1 | Select-String "version" | ForEach-Object { $_.ToString().Split('"')[1] }
    Write-Host "✅ Java: $javaVer"
} catch {
    Write-Host "❌ Java not found. Install JDK 17 from https://adoptium.net/" -ForegroundColor Red
    exit 1
}

# Step 1: Build web assets
Write-Host "`n📦 Building web assets..." -ForegroundColor Yellow
npm run build

# Step 2: Sync Capacitor
Write-Host "`n🔄 Syncing Capacitor Android project..." -ForegroundColor Yellow
npx cap sync android

# Step 3: Build Debug APK
Write-Host "`n🏗️ Building Debug APK..." -ForegroundColor Yellow
Push-Location android
.\gradlew assembleDebug
Pop-Location

# Step 4: Copy APK to root
$apkSource = "android\app\build\outputs\apk\debug\app-debug.apk"
$apkDest = "EventPro-Debug.apk"
if (Test-Path $apkSource) {
    Copy-Item $apkSource $apkDest -Force
    Write-Host "`n🎉 SUCCESS! APK saved to: $apkDest" -ForegroundColor Green
    Write-Host "   Size: $([math]::Round((Get-Item $apkDest).Length / 1MB, 2)) MB" -ForegroundColor Gray
} else {
    Write-Host "`n❌ APK not found at expected path." -ForegroundColor Red
}

Write-Host "`n📱 Install on device:" -ForegroundColor Cyan
Write-Host "   adb install $apkDest" -ForegroundColor Gray
Write-Host "`n⚠️  For production release, use:" -ForegroundColor Yellow
Write-Host "   cd android && .\gradlew assembleRelease" -ForegroundColor Gray
