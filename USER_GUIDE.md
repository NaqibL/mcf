# Job Matcher — Your Setup & Operations Guide

This guide explains **what you need to do yourself** (no coding) vs **what the app does automatically**. Steps marked **YOU DO THIS** require you to log in to a dashboard or change a setting. Everything else is handled by the code.

---

## Quick Reference: Who Does What

| Task | Who | Where |
|------|-----|-------|
| Set up Custom SMTP for magic links | **You** | Supabase Dashboard |
| Set Site URL and Redirect URLs | **You** | Supabase Dashboard |
| Add environment variables | **You** | Railway, Vercel |
| Run database migrations (pgvector) | **You** | Supabase SQL Editor |
| Invite users | **You** | Supabase Dashboard |
| Auth, matching, resume processing | **The app** | Automatic |
| Daily job crawl | **GitHub Actions** | Automatic |

---

## Part 1: Fix Magic Link & Login Issues

### Problem
- Magic links expire too quickly
- "Email rate limit exceeded" — can't log in again for an hour
- Login fails if you leave the page and come back

### Solution: Configure Supabase (All **YOU DO THIS**)

#### Step 1.1: Set Up Custom SMTP (Bypass Rate Limits)

Supabase's built-in email has a strict limit (~4 emails per hour). Using your own SMTP provider removes this limit.

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → select your project
2. Click **Authentication** (left sidebar) → **Providers** → **Email**
3. Scroll down to **SMTP Settings**
4. Turn on **Enable Custom SMTP**
5. Sign up for a free account at [Resend](https://resend.com) (3,000 emails/month free)
6. In Resend: **API Keys** → Create API Key → copy it
7. In Resend: **Domains** → add your domain (or use their test domain for development)
8. Back in Supabase SMTP Settings, fill in:
   - **Host:** `smtp.resend.com`
   - **Port:** `465`
   - **Username:** `resend` (literal)
   - **Password:** your Resend API key
   - **Sender email:** the verified email from Resend (e.g. `onboarding@resend.dev` for testing)
   - **Sender name:** `Job Matcher` (or any name)
9. Click **Save**

**Result:** Magic links will be sent through Resend instead of Supabase. No more 4/hour limit.

---

#### Step 1.2: Set Site URL and Redirect URLs

If these are wrong, clicking the magic link sends you to the wrong page and login fails.

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

**Result:** After clicking the magic link, you'll be sent back to your app and stay logged in.

---

#### Step 1.3: (Optional) Extend JWT Expiry

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
| **Login** | User enters email → magic link sent (via your SMTP) → user clicks link → redirected to app → session stored in browser |
| **Resume upload** | User uploads PDF/DOCX → app extracts text → creates profile → computes embedding → stores in Supabase Storage |
| **Job matches** | App loads your resume embedding, compares to all job embeddings, returns top matches |
| **Discover tab** | Shows top resume matches; you rate them to build a "taste" profile |
| **Matches tab** | Lets you filter by resume or taste mode, similarity, job age |
| **Daily crawl** | GitHub Actions runs every day to fetch new jobs from CareersFuture |

---

## Part 4: After Code Changes (pgvector, Re-process, etc.)

When the developer implements the revamp plan, some steps will require **YOU** to run SQL or redeploy.

### 4.1 pgvector Migration (When Implemented)

**YOU DO THIS** once when the migration is added:

1. In Supabase: **SQL Editor** → **New query**
2. The developer will add a file like `scripts/migrations/001_add_pgvector.sql`
3. Copy the contents of that file and paste into the SQL Editor
4. Click **Run**
5. You should see "Success" — the database now supports fast vector search

**Result:** Job loading becomes much faster.

---

### 4.2 Redeploy After Code Pushes

When code is pushed to GitHub:

- **Vercel** redeploys the frontend automatically (if connected to the repo)
- **Railway** redeploys the API automatically (if connected to the repo)
- **GitHub Actions** uses the latest code for the daily crawl

**You do not need to do anything** unless the developer asks you to trigger a manual deploy.

---

## Part 5: Inviting Users (Multi-User)

**YOU DO THIS** to let others use the app:

1. In Supabase: **Authentication** → **Users**
2. Click **Add user** → **Create new user**
3. Enter their email address
4. They will receive an invite (or you can use magic link — they request it from the app)

**Note:** With "Create new user", Supabase may send a password-set email. For magic-link-only flow, ensure **Authentication** → **Providers** → **Email** has "Enable Email provider" on, and users can request a magic link from the login page.

---

## Part 6: Verification Checklist

Use this to confirm everything is set up correctly.

### Supabase
- [ ] Custom SMTP is enabled and tested (send a magic link)
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
- [ ] You can sign in with magic link
- [ ] After login, you can upload a resume and see matches

### GitHub
- [ ] `DATABASE_URL` secret is set
- [ ] Go to **Actions** → **Daily Job Crawl** → **Run workflow** — it should succeed

---

## Part 7: Troubleshooting

### "Email rate limit exceeded"
- **Fix:** Set up Custom SMTP (Part 1.1). The built-in Supabase email has a strict limit.

### "CORS error" or "Missing Allow Origin"
- **Fix:** In Railway, set `ALLOWED_ORIGINS` to your exact Vercel URL: `https://mcf-kappa.vercel.app` (no `*`, no trailing slash, no quotes).

### Magic link sends me to wrong page / login fails after clicking
- **Fix:** Check Site URL and Redirect URLs in Supabase (Part 1.2). They must match your Vercel URL exactly.

### "401 Unauthorized" on API calls
- **Fix:** You must be logged in. Ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set in Vercel. Ensure `SUPABASE_URL` is set in Railway.

### Jobs load very slowly
- **Fix:** This is a known issue. The pgvector migration (Part 4.1) will speed it up once implemented. The first request after a deploy may also be slow (30–60 seconds) while the embedding model loads.

### "Re-process" button fails / 404
- **Fix:** This is a bug in production. The Re-process flow will be fixed in the revamp. For now, use "Replace" to upload a new resume instead.

---

## Part 8: Implementation Status

As the revamp plan is implemented, check this table to see what's done and what still needs your action.

| Item | Your Action Required? | Status |
|------|------------------------|--------|
| Custom SMTP | Yes — Part 1.1 | Pending |
| Site URL + Redirect URLs | Yes — Part 1.2 | Pending |
| JWT expiry (optional) | Yes — Part 1.3 | Pending |
| Environment variables | Yes — Part 2 | Verify |
| pgvector migration | Yes — Part 4.1 (when file exists) | Pending |
| Invite users | Yes — Part 5 | As needed |

---

## Summary

- **Dashboard work (Supabase, Railway, Vercel, GitHub):** You do this.
- **Code (auth, matching, resume, crawl):** The app does this.
- **After migrations or new features:** The developer will tell you if you need to run SQL or change settings.

When in doubt, re-check the Verification Checklist (Part 6).
