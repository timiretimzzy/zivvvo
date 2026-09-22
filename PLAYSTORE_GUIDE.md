# Zivvvo — Google Play Store Submission Guide

## Overview
This guide walks you through publishing Zivvvo on the Google Play Store.
The app code is ready. You need to: create a developer account, build the
Android app, take screenshots, and fill out forms.

---

## Step 1: Create a Google Play Developer Account

1. Go to https://play.google.com/console/signup
2. Sign in with your Google account (use the same one you use for development)
3. Pay the **one-time $25 USD registration fee**
4. Fill in your developer profile:
   - **Developer name:** Your name or "Zivvvo" (this is public)
   - **Contact email:** tawandattimire@gmail.com (or a dedicated email)
   - **Phone number:** for verification
   - **Address:** your physical address (required by Google, shown in some regions)
5. Accept the Developer Distribution Agreement
6. Complete identity verification (may take 24-48 hours)

**Link:** https://play.google.com/console/signup

---

## Step 2: Create a New App in Play Console

1. Go to https://play.google.com/console
2. Click **"Create app"**
3. Fill in:
   - **App name:** Zivvvo
   - **Default language:** English (United States)
   - **App or game:** App
   - **Free or paid:** Free (with in-app purchases if using Paynow)
   - **I confirm this app complies with:** check all boxes
4. Click **"Create app"**

---

## Step 3: Complete the Store Listing

### 3a. Main store listing
Go to: **Store presence > Main store listing**

- **App name:** Zivvvo — ZVID Provisional Licence Prep
- **Short description (max 80 chars):** Pass your Zimbabwe VID provisional licence test
- **Full description (max 4000 chars):**

```
Zivvvo is the #1 offline-first practice app for the Zimbabwe VID Class 2 provisional licence test.

FEATURES:
• 1,300+ exam questions covering all road signs, rules, and vehicle controls
• AI-powered explanations for every question
• Smart study plans that target your weak topics
• Works fully offline — study anywhere, anytime
• Track your progress with mastery scores, streaks, and XP
• Diagnostic mode to assess your readiness
• Mock exam simulator that feels like the real test

BUILT FOR ZIMBABWE:
• Covers all 15 VID exam topics
• Based on the official Zimbabwe Road Code
• Questions written by local driving instructors
• References Zimbabwe-specific road signs and rules

SMART LEARNING:
• Adaptive algorithm learns your strengths and weaknesses
• Spaced repetition ensures you remember what you study
• Detailed analytics show your progress per topic
• Compare your readiness against exam requirements

OFFLINE FIRST:
• All questions work without internet
• Your progress is saved locally
• Optional cloud sync via Google sign-in
• Study on the bus, in class, or anywhere without data

PERFECT FOR:
• Anyone preparing for the Zimbabwe VID Class 2 provisional licence test
• Learner drivers who want extra practice
• Driving schools looking for a digital study tool

Download Zivvvo today and pass your VID test with confidence!
```

### 3b. Graphic assets
You need to upload these in **Store presence > Main store listing > Graphics**:

| Asset | Size | Status | How to create |
|---|---|---|---|
| App icon | 512x512 | DONE | Already in `apps/web/public/icons/icon-512.png` |
| Feature graphic | 1024x500 | NEEDED | Use Canva.com (free) — see below |
| Phone screenshots | min 2, max 8 | NEEDED | Take from your phone — see below |

#### How to create the feature graphic:
1. Go to https://www.canva.com (free account)
2. Search for "Play Store Feature Graphic" template
3. Customise with:
   - Logo: use `apps/web/public/logo-wordmark.png`
   - Background: dark slate (#0f172a)
   - Text: "Pass Your Zimbabwe VID Test" / "1,300+ Questions • AI Explanations • Works Offline"
4. Download as PNG (1024x500)

#### How to take screenshots:
1. Open Zivvvo on your phone (or use Chrome DevTools mobile view)
2. Take screenshots of these screens:
   - Home/dashboard screen
   - Practice session in progress
   - AI tutor explaining a question
   - Results/progress screen
   - Diagnostic mode
   - Topic selection screen
3. Minimum 2 screenshots, recommended 4-8
4. Recommended size: 1080x1920 (phone aspect ratio)
5. Use your phone's built-in screenshot feature (Power + Volume Down on most Android phones)

### 3c. Categorisation
Go to: **Store presence > Main store listing > Categorisation**

- **App category:** Education
- **Tags:** driving, licence, zimbabwe, practice, exam

### 3d. Contact details
- **Email:** tawandattimire@gmail.com
- **Phone:** your number (required, not always public)
- **Website:** https://www.zivvvo.co.zw

### 3e. Privacy policy
- **URL:** https://www.zivvvo.co.zw/privacy.html

### 3f. Data safety
Go to: **Store presence > Data safety**

Fill in based on what the app collects:

| Question | Answer |
|---|---|
| Does your app collect or share user data? | Yes |
| Is data collected by your app? | Yes |
| Data type: Personal info | Name, email (via Google sign-in) |
| Data type: App activity | App interactions, search history |
| Data type: App info and performance | Device IDs |
| Is data encrypted in transit? | Yes |
| Can users request data deletion? | Yes (via Settings > Delete Account) |
| Is data collection optional? | Yes (sign-in is optional, core app works offline) |

---

## Step 4: Content Rating

Go to: **Store presence > Content rating**

1. Click "Continue" on the content rating questionnaire
2. Fill in the IARC questionnaire:
   - **Violence:** None
   - **Fear:** None
   - **Sexuality:** None
   - **Language:** None
   - **User interaction:** None (no chat/social features)
   - **Personal information:** Name and email collected
   - **Digital goods:** None (or select if using Paynow payments)
3. The app will likely receive **Everyone** or **Everyone 3+**
4. Save — this generates your IARC rating ID

---

## Step 5: Target Audience

Go to: **Store presence > Target audience and content**

- **Target age group:** 18+ (or 13+ since the content is educational about driving)
- **Is this app designed for families?** No (it's for driving age users)

---

## Step 6: Countries and Regions

Go to: **Store presence > Pricing and distribution**

- **Countries:** Select Zimbabwe, or all countries (Zimbabwe is the primary market)
- **Pricing:** Free
- **In-app products:** Set up if using Paynow payments (or skip for now)

---

## Step 7: Build the Android App Bundle (AAB)

The app needs to be compiled into an Android App Bundle (.aab file).

### Option A: Use Android Studio (Recommended)

1. **Install Android Studio:**
   - Download: https://developer.android.com/studio
   - Install with default settings
   - During setup, install: Android SDK (API 34), Build Tools, Platform Tools

2. **Open the project:**
   - Open Android Studio
   - Click "Open an existing project"
   - Navigate to the `android/` folder in your Zivvvo project
   - Click "Open"

3. **Sync the project:**
   - Android Studio will detect the Gradle project
   - Click "Sync Now" when prompted
   - Wait for sync to complete (may download dependencies)

4. **Build the AAB:**
   - Go to: Build > Generate Signed Bundle / APK
   - Select "Android App Bundle"
   - Click "Next"
   - For keystore path: browse to `android/app/release-key.jks`
   - **Keystore password:** Zivvvo2026!
   - **Key alias:** zivvvo
   - **Key password:** Zivvvo2026!
   - Click "Next"
   - Select "release" build variant
   - Click "Create" (if asked about destination, use default)
   - Wait for build to complete

5. **Find the AAB file:**
   - It will be at: `android/app/build/outputs/bundle/release/app-release.aab`

### Option B: Command line (if you have Android SDK installed)

```bash
cd android
./gradlew bundleRelease
# AAB will be at: app/build/outputs/bundle/release/app-release.aab
```

---

## Step 8: Upload to Play Console

1. Go to https://play.google.com/console
2. Select your app: Zivvvo
3. Go to **Release > Production**
4. Click **"Create new release"**
5. Upload the `.aab` file from Step 7
6. Add release notes:
   ```
   Initial release of Zivvvo — the #1 Zimbabwe VID provisional licence prep app.
   • 1,300+ exam questions
   • AI-powered explanations
   • Works offline
   • Smart study plans
   ```
7. Click **"Save"**
8. Click **"Review release"**
9. Click **"Start rollout to production"**

---

## Step 9: Review Process

- Google will review your app (usually 1-7 days)
- You'll get an email when it's approved or if there are issues
- If rejected, Google will tell you exactly what to fix
- Once approved, it will appear on the Play Store within a few hours

---

## Important Reminders

1. **DO NOT lose the keystore** (`android/app/release-key.jks`, password: `Zivvvo2026!`).
   If you lose it, you cannot update the app. Back it up somewhere safe.

2. **The `assetlinks.json` must be live** at `https://www.zivvvo.co.zw/.well-known/assetlinks.json`
   before you can test the TWA (Trusted Web Activity) linking.

3. **The web app must be deployed** to `https://www.zivvvo.co.zw` for the TWA to work
   (since the Android app just opens the URL in a standalone Chrome window).

4. **To update the app later:**
   - Bump `versionCode` in `android/app/build.gradle` (increment by 1)
   - Bump `versionName` in `android/app/build.gradle`
   - Rebuild the AAB
   - Upload to Play Console as a new release

---

## Quick Reference

| Item | Value |
|---|---|
| Package name | co.zw.zivvvo |
| Version | 1.0.0 (versionCode 1) |
| Min SDK | 24 (Android 7.0) |
| Target SDK | 34 |
| Keystore | android/app/release-key.jks |
| Keystore password | Zivvvo2026! |
| Key alias | zivvvo |
| SHA-256 fingerprint | 95:64:66:0D:73:23:D8:EE:3A:85:C0:C4:2A:3B:D3:BB:7C:53:C6:76:5F:7A:F5:BF:44:66:B7:52:5F:26:34:B0 |
| Web URL | https://www.zivvvo.co.zw |
| Privacy policy | https://www.zivvvo.co.zw/privacy.html |
| Terms of service | https://www.zivvvo.co.zw/tos.html |
| assetlinks.json | https://www.zivvvo.co.zw/.well-known/assetlinks.json |
| Play Console | https://play.google.com/console |
| Android Studio | https://developer.android.com/studio |
