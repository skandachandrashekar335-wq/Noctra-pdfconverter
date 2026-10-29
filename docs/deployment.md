# Noctra 3.0 — Vercel Deployment & Environments Guide

This document explains the production and preview deployment topology for Noctra on Vercel.

---

## 1. Hosting Architecture Overview

- **Hosting Platform:** Vercel (Edge Network + Serverless Functions)
- **Framework:** Next.js 16 (App Router)
- **Node Runtime:** Node.js 24.x
- **Build Command:** `next build`
- **Output Directory:** Default (`.next`)
- **Document Processing:** Client-side WebAssembly / Canvas / JavaScript (No server-side document rendering bottlenecks)

---

## 2. Environment Variables Matrix

Vercel project environment variables must be configured under **Project Settings** > **Environment Variables**.

| Variable | Environment | Security Scope | Purpose |
| :--- | :--- | :--- | :--- |
| `SUPABASE_URL` | Production, Preview, Dev | **Server-Only** (No `NEXT_PUBLIC_`) | Supabase project API URL (e.g. `https://xxxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview, Dev | **Server-Only** (No `NEXT_PUBLIC_`) | Secret key used strictly in server routes for auth and database operations |
| `FIREBASE_ADMIN_PROJECT_ID` | Production, Preview, Dev | **Server-Only** | Firebase project identifier for token verification using Google public certs |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Production, Preview, Dev | Client / Public | Firebase client configuration for Google Auth popup |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Production, Preview, Dev | Client / Public | Authorized domain for Google popup redirects |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Production, Preview, Dev | Client / Public | Firebase project identifier for client SDK |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`| Production, Preview, Dev | Client / Public | Firebase bucket identifier |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`| Production, Preview, Dev | Client / Public | Cloud messaging sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Production, Preview, Dev | Client / Public | Firebase web application identifier |
| `GEMINI_API_KEY` | Production, Preview, Dev | **Server-Only** (Optional) | AI study assistant text query provider |

> [!CAUTION]
> **Zero Supabase Secrets in the Browser:**
> Tests automatically enforce that neither `SUPABASE_SERVICE_ROLE_KEY` nor any `NEXT_PUBLIC_SUPABASE_*` variables exist in the client bundle. Route handlers act as the secure gateway to Supabase.

---

## 3. Preview Deployments & Continuous Integration

1. **Pull Request Workflow:**
   - When a branch is pushed to GitHub, Vercel automatically creates an isolated Preview Deployment with an immutable URL.
   - Run tests against this preview build to ensure zero regressions before merging to `main`.

2. **Branch Protection:**
   - The `main` branch is protected.
   - Automated tests (`npm test`) and backend schema checks must pass before merging.

3. **Production Deployment:**
   - Merges to `main` automatically trigger a production build deployed to `https://noctra-pdfconverter.vercel.app`.
   - Vercel performs zero-downtime atomic deployments. Instant rollback to any prior deployment is available in the Vercel dashboard with a single click.
