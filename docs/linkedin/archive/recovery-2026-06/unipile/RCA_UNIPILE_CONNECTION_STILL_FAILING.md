# Root Cause Analysis: Unipile LinkedIn Connection Still Failing (Post-Fix Attempt)

## Document Information

**Date:** 2026-06-18  
**Status:** Analysis Complete (No Code Changes)  
**Priority:** High  
**Severity:** Blocking — LinkedIn not connected in ALwrity despite Unipile success  

---

## Executive Summary

Unipile LinkedIn authentication **continues to succeed on Unipile's platform** (HTTP 201 auth link, `status=success` redirect with valid `account_id`). The failure remains **entirely on the ALwrity callback delivery path**.

**Primary root cause (confirmed):** The OAuth `success_redirect_url` registered with Unipile still points to **`https://your-backend-ngrok.ngrok-free.dev`**, which is **offline** (`ERR_NGROK_3200`). The browser never reaches the ALwrity backend callback handler.

**Secondary root cause:** Environment variable priority in `_resolve_public_backend_url()` allows **`NGROK_URL` or `LINKEDIN_SOCIAL_REDIRECT_URI`** to override placeholder detection. If either is set to the documentation placeholder, the localhost fallback never applies.

**Tertiary root cause:** Auto-sync (`try_sync_unipile_accounts`) **ran** (HTTP 200 from Unipile list accounts API) but **did not persist credentials** — likely due to empty/misparsed account list response, with **no error log** when zero accounts are returned.

---

## Current Symptoms

| Observation | Evidence |
|-------------|----------|
| Unipile auth link created | `POST .../hosted/accounts/link` → **HTTP 201 Created** (17:49:10) |
| Unipile auth completes | Redirect URL contains `status=success&account_id=ABUXWJy6SxCarPkFaO-EaQ` |
| User matching works | Redirect URL contains `name=user_33md5AyX4Z8Zy9v51VJVgnXqAnM` |
| Callback never reaches ALwrity | **No** `[LinkedInConnect] Unipile callback` log entries |
| Browser shows ngrok offline | `ERR_NGROK_3200` on `your-backend-ngrok.ngrok-free.dev` |
| ALwrity UI stuck / failed | Frontend never receives `LINKEDIN_OAUTH_SUCCESS` |
| Unipile dashboard | Multiple LinkedIn accounts show **Running** (orphaned from ALwrity DB) |
| Auto-sync attempted | `GET .../api/v1/accounts?provider=LINKEDIN` → **HTTP 200** (17:49:06, 17:49:07) |
| Auto-sync did not connect | No `[LinkedInConnect] Stored Unipile credentials` or sync recovery logs |

---

## Evidence Analysis

### 1. Screenshot — Callback URL (17:50)

```
https://your-backend-ngrok.ngrok-free.dev/api/linkedin-social/callback
  ?provider=unipile
  &status=success
  &name=user_33md5AyX4Z8Zy9v51VJVgnXqAnM
  &account_id=ABUXWJy6SxCarPkFaO-EaQ
```

**Interpretation:**
- Unipile completed authentication successfully
- User ID (`name`) is correctly appended to redirect (recent code fix is active for this param)
- Redirect host is still the **placeholder ngrok domain**, not `localhost:8000`
- ngrok reports endpoint offline → ALwrity callback handler never executes

### 2. Terminal Logs — What Ran vs What Didn't

**Did run:**
```
17:49:06  GET  .../api/v1/accounts?provider=LINKEDIN  → 200 OK   (auto-sync #1)
17:49:07  GET  .../api/v1/accounts?provider=LINKEDIN  → 200 OK   (auto-sync #2)
17:49:10  POST .../api/v1/hosted/accounts/link        → 201 Created
```

**Did NOT run (expected if callback worked):**
```
[LinkedInConnect] Unipile redirect URLs user_id=... success=http://...
[LinkedInConnect] Resolved callback user from Unipile name=...
[LinkedInConnect] Unipile callback user_id=...
[LinkedInConnect] Stored Unipile credentials for user=...
[LinkedInConnect] Unipile sync recovery linking latest account ...
```

The absence of callback logs between 17:49:10 and 17:50 confirms the redirect never hit `localhost:8000` or any reachable ALwrity server.

### 3. Unipile Dashboard — Orphaned Accounts

Multiple LinkedIn accounts (e.g. `QiDPhAtYRxioaW2R1JQ8uA`, `ABUXWJy6SxCarPkFaO-EaQ`) show **Running** on Unipile but ALwrity's per-user SQLite DB has no corresponding `unipile_account_id`. This is consistent with callback + sync both failing to persist credentials.

---

## Complete Call Chain (Current Session)

```
1. User opens LinkedIn Writer → GET /api/linkedin-social/connection/status
       │
       ├─ try_sync_unipile_accounts() → GET /api/v1/accounts (200 OK)
       │     └─ Returns False (no credentials stored) — silent failure
       │
2. User clicks "Connect LinkedIn" → GET /api/linkedin-social/auth/url
       │
       ├─ _get_unipile_redirect_urls(user_id)
       │     └─ Uses _resolve_public_backend_url()
       │     └─ Resolves to: https://your-backend-ngrok.ngrok-free.dev  ❌
       │
       ├─ POST Unipile /hosted/accounts/link → 201 Created ✅
       │
3. Popup: Unipile Hosted Auth → LinkedIn login + OTP → success ✅
       │
4. Browser redirect to success_redirect_url:
       https://your-backend-ngrok.ngrok-free.dev/...&status=success&name=...&account_id=... 
       │
       └─ ERR_NGROK_3200 — endpoint offline ❌
              │
              ├─ handle_oauth_callback_get() NEVER called
              ├─ store_unipile_credentials() NEVER called
              ├─ postMessage LINKEDIN_OAUTH_SUCCESS NEVER sent
              └─ Frontend: popup closes → "connection closed before completing"
```

---

## Root Cause #1 (Primary): Offline Placeholder ngrok in Redirect URL

### Mechanism

When generating the Unipile hosted auth link, ALwrity sends `success_redirect_url` in the POST payload. Unipile stores this URL and redirects the user's browser there after successful LinkedIn authentication.

The screenshot proves the registered URL host is:
```
your-backend-ngrok.ngrok-free.dev
```

This is a **documentation placeholder**, not a live ngrok tunnel. No ALwrity backend is listening at that public address.

### Why `_resolve_public_backend_url()` Fallback Did Not Apply

Current resolution priority in `linkedin_oauth.py`:

```
1. LINKEDIN_SOCIAL_REDIRECT_URI  → extract origin (NO placeholder check)
2. NGROK_URL                     → use as-is (NO placeholder check)
3. BACKEND_URL                   → placeholder check applied
4. Fallback                      → http://localhost:8000
```

**Critical gap:** Steps 1 and 2 return immediately if the env var is **set**, even when the value is the placeholder `your-backend-ngrok.ngrok-free.dev`. Only `BACKEND_URL` is validated for placeholder strings.

**Most likely configuration state:**

| Env Variable | Probable Value | Effect |
|--------------|----------------|--------|
| `NGROK_URL` or `LINKEDIN_SOCIAL_REDIRECT_URI` | `https://your-backend-ngrok.ngrok-free.dev/...` | Wins priority → placeholder used |
| `BACKEND_URL` | Same placeholder OR unset | Never reached, or also placeholder |

**Expected log if fallback worked:**
```
[LinkedInConnect] No valid BACKEND_URL/NGROK_URL configured; using http://localhost:8000...
```
This log is **absent** from the terminal output → confirms a higher-priority env var is set to the placeholder.

---

## Root Cause #2 (Secondary): Auto-Sync Ran But Did Not Connect

### Evidence

Two successful `GET /api/v1/accounts?provider=LINKEDIN` calls at 17:49:06–07 align with `get_connection_status` calling `try_sync_unipile_accounts()` when `provider=unipile` and user is not connected.

### Why Sync Likely Failed Silently

**File:** `backend/services/integrations/linkedin_oauth.py` — `try_sync_unipile_accounts()`

```python
items = await client.list_accounts(provider="LINKEDIN")
if not items:
    return False   # ← No log message when empty
```

**File:** `backend/services/integrations/linkedin/unipile_client.py` — `list_accounts()`

```python
items = data.get("items", [])
if not isinstance(items, list):
    items = []
logger.info(f"[UnipileClient] Listed {len(items)} accounts")
return items
```

**Hypothesis:** Unipile's `GET /api/v1/accounts` response may use a different JSON shape than `{ "items": [...] }`. If the accounts array is under another key (or returned as a top-level array), `items` resolves to `[]`.

**Supporting evidence:**
- Unipile dashboard shows **3+ Running** LinkedIn accounts
- HTTP 200 from list API
- **No** `[UnipileClient] Listed N accounts` in user logs (may be filtered, but also no sync recovery WARNING)
- **No** credential storage logs

**Result:** Auto-sync returns `False` without visible error → user remains disconnected → user clicks Connect again → creates yet another orphaned Unipile account.

---

## Root Cause #3 (Tertiary): Webhook Path Also Unreachable

`notify_url` is configured as:
```
https://your-backend-ngrok.ngrok-free.dev/api/unipile/webhook
```

Unipile sends server-to-server POST to `notify_url` with:
```json
{
  "status": "CREATION_SUCCESS",
  "account_id": "ABUXWJy6SxCarPkFaO-EaQ",
  "name": "user_33md5AyX4Z8Zy9v51VJVgnXqAnM"
}
```

This webhook **cannot reach** an offline ngrok endpoint or `localhost`. Even with the webhook handler implemented, it provides no fallback while the URL is wrong.

**Terminal evidence:** No `[UnipileWebhook] Received notification` log entries.

---

## Root Cause #4 (Tertiary): Frontend Depends on Callback HTML

**File:** `frontend/src/utils/linkedInOAuthConnect.ts`

The frontend resolves the OAuth promise **only** when the callback page posts `LINKEDIN_OAUTH_SUCCESS`. If the popup loads an ngrok error page instead of ALwrity callback HTML:

1. No `postMessage` is sent
2. Poll detects `popup.closed` → rejects with *"closed before completing"*
3. UI shows connection failure despite Unipile success

This is **correct frontend behavior** given the callback never succeeded.

---

## What Is NOT the Problem

| Area | Status | Evidence |
|------|--------|----------|
| Async/await architecture | ✅ Fixed | HTTP 201, no `asyncio.run()` errors |
| `expiresOn` timestamp format | ✅ Fixed | HTTP 201 (was HTTP 400 before) |
| Auth link response parsing | ✅ Fixed | Popup opens (was "missing link field" before) |
| Unipile API key / DSN | ✅ Working | All Unipile API calls return 200/201 |
| Unipile LinkedIn auth | ✅ Working | `status=success` in redirect URL |
| User ID in redirect | ✅ Working | `name=user_33md5AyX4Z8Zy9v51VJVgnXqAnM` present |
| Callback user resolution code | ✅ Ready | Would work if callback page loaded |
| Webhook handler code | ✅ Implemented | Would work if URL were reachable |

---

## Environment Configuration Diagnosis

### Required Fix (Configuration — No Code)

Check `backend/.env` for these variables. **At least one is likely set to the placeholder:**

```bash
# PROBLEM — placeholder values (must be removed or updated):
NGROK_URL=https://your-backend-ngrok.ngrok-free.dev
LINKEDIN_SOCIAL_REDIRECT_URI=https://your-backend-ngrok.ngrok-free.dev/api/linkedin-social/callback
BACKEND_URL=https://your-backend-ngrok.ngrok-free.dev
```

### Option A — Local dev without ngrok (browser callback only)

```bash
# Remove or comment out placeholder NGROK_URL and LINKEDIN_SOCIAL_REDIRECT_URI
# Ensure BACKEND_URL is unset or not a placeholder
# Code should fall back to:
#   success_redirect_url = http://localhost:8000/api/linkedin-social/callback?...
```

Restart backend after `.env` changes.

### Option B — Local dev with ngrok (browser callback + webhooks)

```bash
# Terminal 1:
ngrok http 8000

# Terminal 2 — backend/.env (use YOUR actual ngrok URL):
NGROK_URL=https://abc123.ngrok-free.dev
BACKEND_URL=https://abc123.ngrok-free.dev
```

Restart backend. Verify redirect log shows live ngrok URL, not placeholder.

---

## Verification Checklist (After Config Fix)

| Step | Expected Result |
|------|-----------------|
| Restart backend, click Connect | Log shows `success=http://localhost:8000/...` OR live ngrok URL |
| Complete Unipile auth | Browser loads ALwrity callback HTML (not ngrok error) |
| Backend logs | `[LinkedInConnect] Unipile callback succeeded user_id=...` |
| Backend logs | `[LinkedInConnect] Stored Unipile credentials for user=...` |
| Frontend | Exits "Connecting..." → shows connected |
| Refresh page | `GET /connection/status` → `connected: true`, `provider: "unipile"` |

---

## Scope of Code Fix (High Level — For Future Implementation)

When code changes are approved:

| # | Fix | File | Purpose |
|---|-----|------|---------|
| 1 | Apply placeholder detection to `NGROK_URL` and `LINKEDIN_SOCIAL_REDIRECT_URI` | `linkedin_oauth.py` | Prevent placeholder bypass |
| 2 | Log when `list_accounts` returns 0 but HTTP 200 | `unipile_client.py` / `linkedin_oauth.py` | Surface silent sync failure |
| 3 | Parse alternate Unipile list response shapes | `unipile_client.py` | Fix auto-sync for existing accounts |
| 4 | Startup warning if redirect URL contains placeholder | `linkedin_oauth.py` or startup | Fail fast on misconfiguration |
| 5 | Log resolved redirect URL at INFO on auth URL generation | `linkedin_oauth.py` | Easier debugging |

---

## Risk Assessment

| Risk | Likelihood | Impact |
|------|------------|--------|
| More duplicate Unipile accounts on each retry | High (already occurring) | Low — cleanup in Unipile dashboard |
| User believes LinkedIn is connected in ALwrity when it isn't | High | High — blocks publishing/analytics |
| ngrok URL changes each session | Medium | Medium — must update `.env` each time |
| Auto-sync never links orphaned accounts | High until list parsing fixed | Medium |

---

## Success Criteria

- [ ] Redirect URL uses reachable host (`localhost:8000` or live ngrok)
- [ ] Callback handler logs appear after Unipile auth
- [ ] `unipile_account_id` stored in user SQLite DB
- [ ] ALwrity UI shows LinkedIn connected
- [ ] Auto-sync links existing Unipile accounts on page load (optional recovery)

---

## Document Control

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-06-18 | Initial RCA — persistent ngrok placeholder + silent sync failure |

---

**End of Root Cause Analysis**
