# Noctra

> **Your documents were never designed for dark mode. Noctra was.**

Noctra converts bright study PDFs and PowerPoint presentations into comfortable dark-mode versions — preserving text, diagrams, images, and structure.

---

## What Noctra does

Students commonly study from documents with white backgrounds and black text. Late-night reading on bright screens causes eye strain. Noctra transforms those documents so they're comfortable in the dark:

- **PDF** files are rendered page-by-page, transformed with an intelligent pixel-level algorithm, and re-assembled into a downloadable PDF
- **PPTX** files are patched structurally (XML-level) — slides remain fully editable in PowerPoint after conversion

**Noctra does NOT simply invert every pixel.** Text, backgrounds, and low-saturation shapes are remapped to a dark palette. Photographs, diagrams, charts, and screenshots are preserved (only slightly dimmed) so they stay visually useful.

---

## Features

- 🌙 Intelligent dark-mode conversion for PDF and PPTX
- 🔒 Firebase Google authentication
- 📁 Drag-and-drop upload with real-time progress
- 📜 Conversion history dashboard (powered by Firestore)
- 🧠 All processing runs in your browser — documents never leave your device
- 🎨 Smooth animations (Anime.js v4) with reduced-motion support
- 📱 Responsive design

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 + CSS variables |
| Animation | Anime.js v4 |
| Authentication | Firebase Authentication (Google) |
| Database | Cloud Firestore |
| PDF rendering | PDF.js (pdfjs-dist) |
| PDF generation | pdf-lib |
| PPTX parsing | JSZip |
| Deployment | Vercel |

---

## Local setup

### Prerequisites

- Node.js 20+
- npm 10+
- A Firebase project (see below)

### 1. Clone and install

```bash
git clone <your-repo-url>
cd Noctra-pdfconverter
npm install
```

### 2. Set up Firebase

1. Go to [Firebase Console](https://console.firebase.google.com) and create a new project
2. In **Authentication → Sign-in method**, enable **Google**
3. In **Firestore Database**, create a database in production mode
4. In **Project Settings → Your apps**, add a **Web app** and copy the config
5. In **Project Settings → Service Accounts**, click **Generate new private key** and download the JSON

### 3. Set up Google Authentication

In Firebase Console → Authentication → Sign-in method → Google:
- Enable Google sign-in
- Add your domain to the **Authorized domains** list (for local dev, `localhost` is already included)

### 4. Environment variables

Copy the template and fill in your values:

```bash
cp .env.local .env.local.backup  # keep a backup
```

Edit `.env.local`:

```env
# Firebase Web App config (from Project Settings → Your apps)
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc...

# Firebase Admin SDK (from the downloaded service account JSON)
FIREBASE_ADMIN_PROJECT_ID=your-project-id
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

> ⚠️ **Never commit `.env.local`** — it's already in `.gitignore`.

### 5. Firestore security rules

In Firebase Console → Firestore → Rules, paste:

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own profile
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Users can only read/write their own conversions
    match /conversions/{conversionId} {
      allow read, write: if request.auth != null
        && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null
        && request.auth.uid == request.resource.data.userId;
    }
  }
}
```

### 6. Development commands

```bash
# Start development server (with Turbopack)
npm run dev

# Type check
npx tsc --noEmit

# Production build
npm run build

# Start production server locally
npm start

# Lint
npm run lint
```

Open [http://localhost:3000](http://localhost:3000).

---

## Production deployment to Vercel

### Option A: Vercel dashboard

1. Push your code to a GitHub repository
2. Go to [vercel.com](https://vercel.com) → Import Project → select your repo
3. Add all environment variables from `.env.local` in the Vercel project settings
4. Deploy — Vercel auto-detects Next.js

### Option B: Vercel CLI

```bash
npm i -g vercel
vercel login
vercel --prod
```

### Add your production domain to Firebase

After deploying, go to Firebase Console → Authentication → Authorized domains and add your Vercel domain (e.g. `noctra.vercel.app`).

---

## Architecture notes

### Why browser-side processing?

Vercel serverless functions have a **10-second timeout** and a **4 MB request body limit** on the Hobby plan — both too small for real document conversion. By running PDF.js and JSZip directly in the user's browser:

- No timeout constraints
- Documents never leave the user's device (privacy benefit)
- No server costs for compute

The Firestore writes (creating/updating conversion records) still go through the Firebase client SDK, which handles auth token verification automatically.

### PPTX conversion quality

PPTX conversion is structural (XML-patching), which means:

- ✅ Output is a valid, editable `.pptx` file
- ✅ Text, fonts, and positioning are perfectly preserved
- ⚠️ Complex gradient fills may not transform perfectly
- ⚠️ Theme inheritance can be inconsistent across different PowerPoint templates
- ⚠️ SmartArt and WordArt elements are partially supported

For best results, test with standard lecture slide templates.

### PDF conversion quality

PDF conversion rasterises each page at 2× resolution using PDF.js, applies the dark transform, then re-assembles into a PDF using pdf-lib:

- ✅ All visual content is preserved
- ✅ Good quality at 92% JPEG compression
- ⚠️ Output is not searchable (text is baked into images)
- ⚠️ File size will typically be larger than the original

A future version could use a PDF editing library that preserves text as vectors.

---

## Known limitations

- Large PDFs (50+ pages) may take 30–60 seconds in the browser
- Very complex gradients in PPTX may not convert correctly
- PDF output text is rasterised (not copy-paste selectable)
- The PPTX engine covers common slide structures; edge cases in complex templates may need manual touch-up

---

## Project structure

```
src/
├── app/
│   ├── dashboard/page.tsx    # Protected dashboard
│   ├── globals.css           # Design tokens + utility classes
│   ├── layout.tsx            # Root layout with AuthProvider
│   └── page.tsx              # Landing page
├── components/
│   ├── AuthGuard.tsx         # Redirect-to-home wrapper
│   ├── ConversionList.tsx    # Real-time Firestore conversion history
│   ├── GoogleSignInButton.tsx
│   └── UploadZone.tsx        # Drag-drop upload + conversion UI
├── hooks/
│   └── useAuth.tsx           # Firebase auth context + Google sign-in
├── lib/
│   ├── conversion.ts         # Browser-side conversion orchestrator
│   ├── firebase-admin.ts     # Server-side Firebase Admin SDK
│   ├── firebase.ts           # Client-side Firebase SDK
│   ├── pdf-converter.ts      # PDF dark-mode engine (PDF.js + pdf-lib)
│   ├── pptx-converter.ts     # PPTX dark-mode engine (JSZip + XML)
│   └── stubs/                # Browser stubs for Node-only packages
└── types/
    └── index.ts              # Shared TypeScript types
```
