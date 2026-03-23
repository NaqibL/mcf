# Job Matcher — Your Setup & Operations Guide

Developers: see [HANDOVER.md](HANDOVER.md) and [docs/INDEX.md](docs/INDEX.md) for architecture and repo map. This guide is for **operators** setting up hosted services.

This guide explains **what you need to do yourself** (no coding) vs **what the app does automatically**. Steps marked **YOU DO THIS** require you to log in to a dashboard or change a setting. Everything else is handled by the code.

---

## Quick Reference: Who Does What

| Task | Who | Where |
|------|-----|-------|
| Enable simple email+password auth | **You** | Supabase Dashboard |
| Set Site URL and Redirect URLs | **You** | Supabase Dashboard |
| Add environment variables | **You** | Railway, Vercel |
| Run database migrations (pgvector) | **You** | Supabase SQL Editor |
| Add users (optional) | **You** | Supabase Dashboard or self-signup |
| Auth, matching, resume processing | **The app** | Automatic |
| Daily job crawl | **GitHub Actions** | Automatic |

**No email services needed.** The app uses simple email+password login. No magic links, no Resend, no SMTP. Each user’s taste profile and resume are stored in Supabase and linked to their account.

---

## Part 1: Simple Login (Email + Password)

The app uses **email + password** authentication. No magic links, no external email services (Resend, SMTP, etc.). Each login assigns the person’s taste profile and stores their resume in Supabase.

### Step 1.1: Configure Supabase Auth (**YOU DO THIS**)

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → select your project
2. Click **Authentication** (left sidebar) → **Providers** → **Email**
3. Ensure **Enable Email provider** is ON
4. Turn **OFF** “Confirm email” — this lets users sign in immediately without clicking a verification link
5. Click **Save**

**Result:** Users can sign up and sign in with email + password. No emails are sent. No Resend or SMTP needed.

---

### Step 1.2: Set Site URL and Redirect URLs

1. In Supabase: **Authentication** → **URL Configuration**
2. Set **Site URL** to your exact Vercel URL:
   ```
   https://mcf-kappa.vercel.app
   ```
   (No trailing slash. Use your actual URL if different.)
3. Under **Redirect URLs**, add:
   ```
   https://mcf-kappa.vercel.app/**
   ```
   The `**` means "any path on this domain". Add one per line if you have multiple URLs.
4. Click **Save**

---

### Step 1.3: (Optional) Extend JWT Expiry

If sessions expire too quickly (e.g. you get logged out after 1 hour):

1. In Supabase: **Project Settings** (gear icon) → **API** → **JWT Settings**
2. Find **JWT expiry** (default 3600 seconds = 1 hour)
3. You can increase to 7200 (2 hours) or 14400 (4 hours) for easier testing
4. **Do not** go below 300 (5 minutes) — Supabase recommends against it

**Result:** You stay logged in longer before needing to sign in again.

---

## Part 2: Environment Variables Checklist

These must be set correctly for the app to work. **YOU DO THIS** in each service.

### Railway (API Backend)

| Variable | Example Value | Notes |
|----------|---------------|-------|
| `DATABASE_URL` | `postgresql://postgres.xxx:password@...?sslmode=require` | From Supabase → Settings → Database |
| `SUPABASE_URL` | `https://xxxxx.supabase.co` | From Supabase → Settings → API |
| `SUPABASE_SERVICE_KEY` | `eyJ...` (long string) | From Supabase → Settings → API → service_role |
| `ALLOWED_ORIGINS` | `https://mcf-kappa.vercel.app` | Your exact Vercel URL, no trailing slash |

**Where:** Railway → your project → API service → **Variables**

---

### Vercel (Frontend)

| Variable | Example Value | Notes |
|----------|---------------|-------|
| `NEXT_PUBLIC_API_URL` | `https://your-api.up.railway.app` | Your Railway API URL |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxxx.supabase.co` | Same as Railway |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` (long string) | From Supabase → Settings → API → anon public |

**Where:** Vercel → your project → **Settings** → **Environment Variables**

---

### GitHub (Daily Crawl)

| Secret | Value | Notes |
|--------|-------|-------|
| `DATABASE_URL` | Same as Railway | For the daily job crawl workflow |

**Where:** GitHub repo → **Settings** → **Secrets and variables** → **Actions**

---

## Part 3: What the App Does (No Action Needed)

| Feature | What Happens |
|---------|--------------|
| **Login** | User enters email + password → session stored in browser. No email sent. Taste profile and resume are linked to their account. |
| **Resume upload** | User uploads PDF/DOCX → app extracts text → creates profile → computes embedding → stores in Supabase Storage |
| **Job matches** | App loads your resume embedding, compares to all job embeddings, returns top matches |
| **Discover tab** | Shows top resume matches; you rate them to build a "taste" profile |
| **Matches tab** | Lets you filter by resume or taste mode, similarity, job age |
| **Daily crawl** | GitHub Actions runs every day to fetch new jobs from CareersFuture |

---

## Part 4: After Code Changes (pgvector, Re-process, etc.)

When the developer implements the revamp plan, some steps will require **YOU** to run SQL or redeploy.

### 4.1 pgvector Migration (Optional but Recommended)

**YOU DO THIS** once to speed up job matching:

1. In Supabase: **SQL Editor** → **New query**
2. Open `scripts/migrations/001_add_pgvector.sql` from this project
3. Copy the contents and paste into the SQL Editor
4. Click **Run**
5. You should see "Success" — the database now supports fast vector search

**Result:** Job matching becomes much faster (especially with many jobs). The app works without this migration but will fall back to a slower full scan.

---

### 4.2 Redeploy After Code Pushes

When code is pushed to GitHub:

- **Vercel** redeploys the frontend automatically (if connected to the repo)
- **Railway** redeploys the API automatically (if connected to the repo)
- **GitHub Actions** uses the latest code for the daily crawl

**You do not need to do anything** unless the developer asks you to trigger a manual deploy.

---

## Part 5: Adding Users (Multi-User)

**Option A — Self-signup (simplest):** Users go to the app and click “Sign up”. They enter email + password and are in immediately. No admin action needed.

**Option B — Admin creates users:** If you prefer to control who can access:

1. In Supabase: **Authentication** → **Users**
2. Click **Add user** → **Create new user**
3. Enter their email and a temporary password
4. Share the password with them (e.g. in person or via a secure channel)
5. They sign in with email + password on the login page

**Note:** With “Confirm email” turned OFF (Part 1.1), no verification emails are sent. No Resend or SMTP needed.

---

## Part 6: Verification Checklist

Use this to confirm everything is set up correctly.

### Supabase
- [ ] Email provider enabled, “Confirm email” OFF (Part 1.1)
- [ ] Site URL = `https://mcf-kappa.vercel.app` (or your URL)
- [ ] Redirect URLs include `https://mcf-kappa.vercel.app/**`
- [ ] `resumes` storage bucket exists
- [ ] Tables exist (run `SELECT COUNT(*) FROM jobs;` in SQL Editor — should return a number)

### Railway
- [ ] All variables set (see Part 2)
- [ ] API is live: visit `https://your-api.up.railway.app/docs` — you should see the API docs
- [ ] `ALLOWED_ORIGINS` matches your Vercel URL exactly

### Vercel
- [ ] All variables set (see Part 2)
- [ ] Frontend loads at your Vercel URL
- [ ] You can sign in with email + password
- [ ] After login, you can upload a resume and see matches

### GitHub
- [ ] `DATABASE_URL` secret is set
- [ ] Go to **Actions** → **Daily Job Crawl** → **Run workflow** — it should succeed

---

## Part 7: Troubleshooting

### "Invalid login credentials" or wrong password
- **Fix:** Ensure the user has the correct password. If they forgot it, reset via Supabase Dashboard → Authentication → Users → select user → Send password recovery (or create a new password). Note: password recovery sends an email; if you want zero email, create a new password in the dashboard and share it with the user.

### "CORS error" or "Missing Allow Origin" (especially on resume upload with auth)
- **Why:** With auth enabled, the upload request sends an `Authorization` header, which triggers a CORS preflight. The API must respond with `Access-Control-Allow-Origin` matching your frontend origin exactly.
- **Fix:** In Railway, set `ALLOWED_ORIGINS` to your exact Vercel URL: `https://mcf-kappa.vercel.app` (no `*`, no trailing slash, no quotes). For local dev with auth, include `http://localhost:3000`.
- **Verify:** Open your deployed app, then in the browser console run:
  `fetch('https://your-api.railway.app/api/cors-check').then(r=>r.json()).then(console.log)`
  Check that `request_origin` matches your frontend URL and `origin_allowed` is `true`.

### Login fails or redirects to wrong page
- **Fix:** Check Site URL and Redirect URLs in Supabase (Part 1.2). They must match your Vercel URL exactly.

### "401 Unauthorized" on API calls
- **Fix:** You must be logged in. Ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set in Vercel. Ensure `SUPABASE_URL` is set in Railway.

### Jobs load very slowly
- **Fix:** This is a known issue. The pgvector migration (Part 4.1) will speed it up once implemented. The first request after a deploy may also be slow (30–60 seconds) while the embedding model loads.

### "Re-process" button fails / 404
- **Fix:** Re-process now fetches from Supabase Storage when the local file is missing. Ensure you have uploaded a resume at least once, and that Supabase Storage is configured (`SUPABASE_URL` + `SUPABASE_SERVICE_KEY` in Railway).

---

## Part 8: Code Changes (Already Done)

The following code changes have been made to support simple email+password login:

| Change | File | What it does |
|--------|------|--------------|
| Auth form | `frontend/app/components/AuthGate.tsx` | Replaced magic-link flow with email+password sign-in and sign-up. Users can create an account or sign in directly. |

No backend changes were needed. The API already uses Supabase JWTs; it does not care whether the user signed in via magic link or password.

---

## Part 9: Implementation Status

As the revamp plan is implemented, check this table to see what's done and what still needs your action.

| Item | Your Action Required? | Status |
|------|------------------------|--------|
| Email+password auth (Confirm email OFF) | Yes — Part 1.1 | Pending |
| Site URL + Redirect URLs | Yes — Part 1.2 | Pending |
| JWT expiry (optional) | Yes — Part 1.3 | Pending |
| Environment variables | Yes — Part 2 | Verify |
| pgvector migration | Yes — Part 4.1 (when file exists) | Pending |
| Add users | Yes — Part 5 (as needed) | As needed |

---

## Summary

- **Dashboard work (Supabase, Railway, Vercel, GitHub):** You do this.
- **Code (auth, matching, resume, crawl):** The app does this.
- **After migrations or new features:** The developer will tell you if you need to run SQL or change settings.

When in doubt, re-check the Verification Checklist (Part 6).
