# Hazemate Platform Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish Hazemate as a production-ready PWA with CI/CD, Playwright regression testing, and privacy-conscious PostHog analytics.

**Architecture:** Next.js remains the PWA frontend and Vercel deployment target. GitHub Actions gates every deploy behind typecheck/build and Playwright; PostHog initializes client-side without capturing precise location. Supabase remains the environmental data cache and API layer.

**Tech Stack:** Next.js 15, React 19, TypeScript, Playwright, PostHog JS, GitHub Actions, Vercel, Supabase.

**Spec:** Existing Hazemate PWA implementation on this branch.

## Global Constraints

- No precise latitude/longitude in analytics events.
- Session replay disabled by default.
- Production deployment only after build and Playwright pass.
- Vercel credentials stored only as GitHub secrets.
- PostHog project key stored as a GitHub secret / Vercel environment variable.

---

### Task 1: Analytics instrumentation

**Files:**
- Create: `instrumentation-client.ts`
- Create: `lib/analytics.ts`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`
- Produces: `captureHazemateEvent(event, properties)`

- [ ] Add conditional PostHog initialization.
- [ ] Add typed Hazemate event names.
- [ ] Instrument region, location permission, environment loading, and install actions.
- [ ] Verify no precise coordinates are passed to PostHog.

### Task 2: Playwright regression suite

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/hazemate.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: local dev server or `PLAYWRIGHT_BASE_URL`
- Produces: Playwright pass/fail and HTML report.

- [ ] Verify the dashboard renders.
- [ ] Verify manual region selection.
- [ ] Verify geolocation permission flow.
- [ ] Verify precise coordinates do not appear in rendered UI.

### Task 3: GitHub Actions deployment gates

**Files:**
- Create: `.github/workflows/ci-cd.yml`
- Create: `.env.example`

**Interfaces:**
- Consumes: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
- Produces: gated preview and production Vercel deployments.

- [ ] Run typecheck/build on PR and push.
- [ ] Run Playwright after quality checks.
- [ ] Upload Playwright artifacts.
- [ ] Deploy PR preview only after tests pass.
- [ ] Deploy production only after tests pass on default branch.

### Task 4: Verification

**Files:** no production code required.

- [ ] Run Vercel build.
- [ ] Confirm no TypeScript errors.
- [ ] Run Playwright against a live preview once CI secrets are present.
- [ ] Confirm PostHog events after a project key is configured.
