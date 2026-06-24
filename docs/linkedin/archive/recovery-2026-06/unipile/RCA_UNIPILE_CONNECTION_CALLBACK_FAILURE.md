# Root Cause Analysis: Unipile LinkedIn Connection Callback Failure

## Document Information

**Date:** 2026-06-18  
**Status:** Analysis Complete (No Code Changes)  
**Priority:** High  
**Severity:** Blocking — LinkedIn never shows as connected in ALwrity  

---

## Executive Summary

Unipile LinkedIn authentication **succeeds on Unipile's side** (credentials accepted, OTP verified, "Account successfully added!" shown). The failure happens **after** that, when Unipile redirects the popup back to ALwrity.

**Primary root cause:** The `success_redirect_url` registered with Unipile points to a **placeholder/offline ngrok hostname** (`your-backend-ngrok.ngrok-free.dev`). The callback never reaches the ALwrity backend, credentials are never stored, and the frontend never receives `LINKEDIN_OAUTH_SUCCESS`.

**Secondary root causes (will block even after ngrok is fixed):**
1. Callback user resolution does not read Unipile's `name` query parameter.
2. The `notify_url` webhook endpoint (`/api/unipile/webhook`) is configured but **not implemented**.
3. Unipile auth flow does not persist OAuth state (unlike Zernio), leaving no fallback for user matching.

---

## Symptoms

| Layer | Symptom |
|-------|---------|
| **Unipile popup** | LinkedIn login, OTP, and "Account successfully added!" all succeed |
| **After Close** | Browser shows `ERR_NGROK_3200` — endpoint offline |
| **ALwrity main UI** | Stuck on **"Connecting..."**, then connection fails |
| **Backend logs** | `HTTP 201 Created` for auth link creation; **no** `/api/linkedin-social/callback` log entries |
| **Connection status** | LinkedIn remains disconnected in ALwrity |

---

## Evidence

### 1. Backend Log — Auth Link Creation Succeeds

```
2026-06-18 17:32:45 | HTTP Request: POST https://api30.unipile.com:16037/api/v1/hosted/accounts/link "HTTP/1.1 201 Created"
```

This confirms:
- Async fix is working (no `asyncio.run()` error)
- Timestamp format fix is working (no HTTP 400 invalid parameters)
- Response parsing fix is working (auth URL returned; popup opened)

### 2. Screenshot — Unipile Auth Succeeds

The popup shows:
- LinkedIn credentials entered
- Green checkmark: **"Account successfully added!"**
- User clicks **Close**

Unipile has successfully linked the LinkedIn account on **their** platform.

### 3. Screenshot — Callback Redirect Fails

Browser URL after redirect:
```
https://your-backend-ngrok.ngrok-free.dev/api/linkedin-social/callback
  ?provider=unipile
  &status=success
  &account_id=QIdPhAtYRxioaW2R1JQ8uA
```

Error page:
```
ERR_NGROK_3200
The endpoint your-backend-ngrok.ngrok-free.dev is offline.
```

This proves:
- Unipile completed auth and redirected with `status=success` and a valid `account_id`
- The redirect target hostname is a **placeholder**, not a live tunnel
- ALwrity backend never received this request (no callback logs at ~17:33)

### 4. Screenshot — Main UI Stuck

ALwrity LinkedIn Assistant shows **"Connecting..."** because the frontend is waiting for a `postMessage` that never arrives.

### 5. Missing Backend Callback Logs

Between `17:32:45` (auth link created) and `17:34` (user still on Connecting screen), there are **zero** log lines such as:
```
[LinkedInConnect] Unipile callback user_id=...
```

If the callback had reached ALwrity, `handle_oauth_callback_get` would log at line 221 of `linkedin_social_routes.py`.

---

## Complete Call Chain

### Phase A — Working (Steps 1–4)

```
User clicks "Connect LinkedIn"
    │
    ▼
frontend: useLinkedInSocialConnection.connectWithOAuth()
    │
    ▼
frontend: connectWithLinkedInOAuth()  [linkedInOAuthConnect.ts]
    │  GET /api/linkedin-social/auth/url
    ▼
backend: get_authorization_url()  [linkedin_social_routes.py:140]
    │
    ▼
backend: generate_authorization_url()  [linkedin_oauth.py:1010]
    │  LINKEDIN_PROVIDER=unipile
    ▼
backend: UnipileClient.create_hosted_auth_link()  [unipile_client.py:91]
    │  POST /api/v1/hosted/accounts/link → HTTP 201
    │  payload includes:
    │    success_redirect_url = {BACKEND_URL}/api/linkedin-social/callback?provider=unipile&status=success
    │    notify_url = {BACKEND_URL}/api/unipile/webhook
    │    name = user_33md5AyX4Z8Zy9v51VJVgnXqAnM
    ▼
frontend: window.open(auth_url) → Unipile hosted auth popup
    │
    ▼
Unipile: LinkedIn login + OTP → "Account successfully added!"  ✅
```

### Phase B — Failing (Step 5)

```
User clicks "Close" on Unipile success screen
    │
    ▼
Unipile redirects popup to success_redirect_url:
    https://your-backend-ngrok.ngrok-free.dev/api/linkedin-social/callback
      ?provider=unipile&status=success&account_id=QIdPhAtYRxioaW2R1JQ8uA
    │
    ▼
ngrok: ERR_NGROK_3200 — tunnel offline  ❌
    │
    ▼
Expected but NEVER reached:
    backend: handle_oauth_callback_get()  [linkedin_social_routes.py:190]
        → _resolve_linkedin_callback_user()
        → handle_unipile_callback()
        → store_unipile_credentials()
        → build_oauth_callback_html() with LINKEDIN_OAUTH_SUCCESS postMessage
    │
    ▼
Expected but NEVER reached:
    frontend: onMessage handler receives LINKEDIN_OAUTH_SUCCESS
        → resolve() → checkStatus() → connected=true
    │
    ▼
Actual outcome:
    Popup shows ngrok error OR user closes popup
    frontend: poll detects popup.closed → reject("closed before completing")
    Main UI: stays "Connecting..." then shows error
    ALwrity DB: no Unipile credentials stored
```

---

## Root Cause #1 (Primary): Invalid `BACKEND_URL` / Offline ngrok Tunnel

### Where Redirect URLs Are Built

**File:** `backend/services/integrations/linkedin_oauth.py`  
**Method:** `_get_unipile_redirect_urls()` (lines 1001–1008)

```python
backend_url = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
return {
    "success": f"{backend_url}/api/linkedin-social/callback?provider=unipile&status=success",
    "failure": f"{backend_url}/api/linkedin-social/callback?provider=unipile&status=error",
    "notify": f"{backend_url}/api/unipile/webhook",
}
```

### What Was Sent to Unipile

From the earlier HTTP 400 error payload (same session), the registered URLs were:
```
success_redirect_url: https://your-backend-ngrok.ngrok-free.dev/api/linkedin-social/callback?provider=unipile&status=success
failure_redirect_url: https://your-backend-ngrok.ngrok-free.dev/api/linkedin-social/callback?provider=unipile&status=error
notify_url:           https://your-backend-ngrok.ngrok-free.dev/api/unipile/webhook
```

`your-backend-ngrok.ngrok-free.dev` is a **documentation placeholder**, not a live tunnel. The screenshot confirms ngrok reports this endpoint as **offline**.

### Why This Breaks the Full Flow

Unipile Hosted Auth requires a **publicly reachable** callback URL. After successful LinkedIn auth, Unipile redirects the user's browser to `success_redirect_url`. If that URL is unreachable:

1. ALwrity never runs `handle_unipile_callback()`
2. `unipile_account_id` is never written to the user's SQLite DB
3. Callback HTML never loads → no `postMessage` to the opener
4. Frontend remains in `isConnecting=true` until popup closes → error

### Local Dev Mismatch

| Component | Actual runtime | Callback URL registered |
|-----------|---------------|---------------------------|
| Frontend | `http://localhost:3000` | — |
| Backend | `http://localhost:8000` (uvicorn) | — |
| Unipile redirect | — | `https://your-backend-ngrok.ngrok-free.dev/...` (offline) |

The backend is running locally but told Unipile to redirect to a dead ngrok hostname.

---

## Root Cause #2 (Secondary): Callback User ID Not Resolved from Unipile `name`

Even if ngrok were online, the callback handler may fail with **401 Authentication required**.

### Current User Resolution Logic

**File:** `backend/api/linkedin_social_routes.py`  
**Function:** `_resolve_linkedin_callback_user()` (lines 63–81)

Resolves user only from:
1. Clerk Bearer token in the popup request (typically **absent** — popup has no auth header)
2. `alwrity_state` / `state` query param looked up in `linkedin_oauth_states` table

### What Unipile Provides

Per Unipile Hosted Auth documentation:
- The `name` field sent at link creation (`user_33md5AyX4Z8Zy9v51VJVgnXqAnM`) is returned on **`notify_url`**
- The success redirect URL in the screenshot contains `account_id` but **not** `name`

### What ALwrity Does for Unipile

**File:** `backend/services/integrations/linkedin_oauth.py` (Unipile branch, lines 1074–1079)

```python
return {
    "auth_url": result.auth_url,
    "state": user_id,  # returned to frontend only — NOT stored in DB
    "provider": "unipile",
}
```

Unlike Zernio (which calls `store_oauth_state()`), the Unipile path **does not persist OAuth state**. There is no DB record to map the callback back to the user.

### Gap

The callback route declares `name: Optional[str] = Query(None)` in the handler signature but **`_resolve_linkedin_callback_user` never reads `name`**. Without ngrok working we cannot confirm a live 401 yet, but the code path is structurally incomplete for Unipile's redirect model.

---

## Root Cause #3 (Secondary): `notify_url` Webhook Not Implemented

**Configured URL:** `{BACKEND_URL}/api/unipile/webhook`

**Codebase search:** No route, router, or handler exists for `/api/unipile/webhook`.

Unipile's recommended integration pattern uses `notify_url` as a **server-to-server** backup to receive account connection events with the `name` (user ID) field. Without this endpoint:

- No fallback if the browser redirect fails (exactly what happened here)
- No way to receive account status changes (CREDENTIALS, reconnect, etc.)

---

## Root Cause #4 (Tertiary): Frontend Popup Completion Detection

**File:** `frontend/src/utils/linkedInOAuthConnect.ts` (lines 94–104)

```typescript
pollTimer = setInterval(() => {
  if (popup.closed) {
    cleanup();
    reject(new Error('LinkedIn connection was closed before completing. Please try again.'));
  }
}, 500);
```

The frontend resolves **only** on `LINKEDIN_OAUTH_SUCCESS` postMessage. If the callback page never loads (ngrok offline), the popup eventually closes and the poll rejects. This is **correct behavior** given the callback never succeeded — it is a **symptom**, not the root cause.

---

## Root Cause #5 (Tertiary): postMessage Origin Trust (Potential Next Blocker)

**File:** `backend/services/integrations/oauth_callback_utils.py`  
Callback HTML posts message to `FRONTEND_URL` or first entry in `OAUTH_CALLBACK_ALLOWED_ORIGINS`.

**File:** `frontend/src/utils/linkedInOAuthConnect.ts`  
Accepts postMessage only from origins in `getTrustedLinkedInOAuthOrigins()` (localhost:3000, API base URL, optional ngrok origin).

Once ngrok is fixed, the callback page origin will be the **ngrok backend URL**. The frontend must trust that origin. If `REACT_APP_NGROK_ORIGIN` / trusted origins are not aligned with the live ngrok URL, postMessage will be silently ignored even after a successful callback.

---

## Comparison: Why Zernio Worked vs Unipile Fails

| Aspect | Zernio (worked) | Unipile (fails) |
|--------|-----------------|-----------------|
| Auth URL generation | Sync HTTP, same backend | Async HTTP, now fixed |
| OAuth state stored | Yes (`store_oauth_state`) | **No** |
| User matching on callback | Via `alwrity_state` in redirect URL | Relies on `name` / webhook — **not wired** |
| Redirect URL source | `LINKEDIN_SOCIAL_REDIRECT_URI` or `BACKEND_URL` | `BACKEND_URL` only |
| Webhook fallback | N/A | `notify_url` configured but **not implemented** |
| Current env issue | Same `BACKEND_URL` dependency | Placeholder ngrok hostname offline |

---

## Async Architecture Status (Previously Fixed — Not This Issue)

The earlier `asyncio.run()` error is **resolved**. Evidence:
- HTTP 201 from Unipile (not RuntimeError)
- Popup opens and full Unipile auth completes
- No "coroutine was never awaited" in latest logs

This RCA addresses a **different failure point** — post-auth callback delivery.

---

## Scope of Fix (High Level — No Implementation)

### Must Fix (Blocking)

| # | Item | File(s) | Action |
|---|------|---------|--------|
| 1 | Set live `BACKEND_URL` | `backend/.env` | Point to active ngrok tunnel (or other public URL) forwarding to `localhost:8000` |
| 2 | Run ngrok during dev | Terminal | `ngrok http 8000` — tunnel must stay up for entire OAuth flow |
| 3 | Resolve user on callback | `linkedin_social_routes.py` | Read Unipile `name` query param in `_resolve_linkedin_callback_user` |

### Should Fix (Recommended)

| # | Item | File(s) | Action |
|---|------|---------|--------|
| 4 | Implement webhook | New route e.g. `api/unipile_webhook_routes.py` | Handle `notify_url` POST; store credentials server-side |
| 5 | Store OAuth state for Unipile | `linkedin_oauth.py` | Optional: persist state like Zernio for defense in depth |
| 6 | Align postMessage origins | `.env` (backend + frontend) | Set `FRONTEND_URL`, `OAUTH_CALLBACK_ALLOWED_ORIGINS`, `REACT_APP_NGROK_ORIGIN` to match live URLs |
| 7 | Validate env at startup | `linkedin_oauth.py` or startup | Warn if `BACKEND_URL` contains placeholder text |

### Environment Checklist for Local Dev

```bash
# backend/.env — must be a LIVE public URL, not a placeholder
BACKEND_URL=https://<your-actual-subdomain>.ngrok-free.dev

# Optional but recommended for postMessage
FRONTEND_URL=http://localhost:3000
OAUTH_CALLBACK_ALLOWED_ORIGINS=http://localhost:3000

# frontend/.env — must match ngrok if used for callbacks
REACT_APP_NGROK_ORIGIN=https://<your-actual-subdomain>.ngrok-free.dev
```

---

## Testing Plan (After Fixes)

### Test 1: Callback Reachability
1. Start ngrok: `ngrok http 8000`
2. Set `BACKEND_URL` to ngrok URL; restart backend
3. Open `https://<ngrok>/api/linkedin-social/callback?provider=unipile&status=success&account_id=test&name=user_xxx` in browser
4. Expect: HTML page (not ngrok offline error)

### Test 2: End-to-End Connection
1. Click Connect LinkedIn
2. Complete Unipile auth
3. Expect backend log: `[LinkedInConnect] Unipile callback succeeded user_id=...`
4. Expect main UI: connected state (not stuck on Connecting)

### Test 3: Connection Status API
1. `GET /api/linkedin-social/connection/status`
2. Expect: `connected: true`, `provider: "unipile"`, `unipile_account_id` present

---

## Risk Assessment

| Risk | Likelihood | Impact | Notes |
|------|------------|--------|-------|
| ngrok URL changes on restart | High | High | Must update `BACKEND_URL` each ngrok session |
| User resolution 401 after ngrok fix | High | High | `name` param not wired yet |
| postMessage origin mismatch | Medium | Medium | After callback works, may need origin alignment |
| Account exists in Unipile but not ALwrity | Already occurred | Low | User may need to reconnect after fix |

---

## Success Criteria

- [ ] Unipile redirect loads ALwrity callback HTML (no ngrok offline error)
- [ ] Backend logs show Unipile callback processing
- [ ] `store_unipile_credentials()` persists account to user DB
- [ ] Frontend receives `LINKEDIN_OAUTH_SUCCESS` and exits Connecting state
- [ ] `GET /connection/status` returns `connected: true`

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-06-18 | Architecture Review | Initial RCA — callback delivery failure |

---

**End of Root Cause Analysis**
