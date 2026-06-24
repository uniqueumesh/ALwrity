# Unipile LinkedIn Connection Fix & Connected Profile UI Plan

## Document Information

**Date:** 2026-06-18  
**Status:** Implementation Plan (Pending Review)  
**Based On:** `docs/RCA_UNIPILE_CONNECTION_STILL_FAILING.md`  
**Priority:** High  
**Estimated Effort:** 1–2 days  

---

## Executive Summary

This plan addresses two related goals:

1. **Fix the Unipile connection flow** so LinkedIn accounts connected on Unipile are persisted in ALwrity and the OAuth popup completes successfully.
2. **Update the connected-state UI** so when `LINKEDIN_PROVIDER=unipile`, the LinkedIn Writer placeholder shows the **connected user's profile photo and name** instead of the Zernio personal analytics dashboard (which is not available for Unipile in Phase 1).

The Zernio analytics dashboard remains unchanged when `LINKEDIN_PROVIDER=zernio`.

---

## Goals

### Must Have
- Unipile OAuth callback reaches ALwrity backend and stores credentials
- Auto-sync recovers orphaned Unipile accounts already on the dashboard
- Connected Unipile users see profile avatar + display name in the placeholder card
- Zernio users continue to see the existing analytics dashboard

### Should Have
- Startup/config warning when redirect URL is a placeholder
- Graceful fallback initials when avatar URL is unavailable
- Disconnect button on connected Unipile profile card

### Out of Scope (This Plan)
- Unipile personal/org analytics implementation (Phase 3 migration)
- Unipile publishing (Phase 4 migration)
- Cleaning up duplicate Unipile accounts in dashboard (manual ops)

---

## Current Architecture (Relevant Paths)

### Connection flow
```
LinkedInConnectionPlaceholder
  → useLinkedInSocialConnection.connectWithOAuth()
  → GET /api/linkedin-social/auth/url
  → Unipile hosted auth popup
  → GET /api/linkedin-social/callback  (BROKEN: offline ngrok)
  → store_unipile_credentials()
  → postMessage LINKEDIN_OAUTH_SUCCESS
```

### Connected UI (today)
```
LinkedInConnectionPlaceholder (connected=true)
  → LinkedInAnalyticsDashboard
  → useLinkedInAnalyticsDashboard
  → GET /api/linkedin-social/analytics/landing  (Zernio-only data path)
```

For Unipile, analytics endpoints call `UnipileProvider` methods that raise `NotImplementedError` → dashboard shows errors or empty metrics.

---

## Phase 1: Fix OAuth Callback & Credential Persistence

**Priority:** Critical — blocks everything else  
**Estimated Time:** 2–3 hours  

### 1.1 Harden public backend URL resolution

**File:** `backend/services/integrations/linkedin_oauth.py`  
**Method:** `_resolve_public_backend_url()`

**Problem:** Placeholder detection only applies to `BACKEND_URL`. `NGROK_URL` and `LINKEDIN_SOCIAL_REDIRECT_URI` bypass checks.

**Changes:**
1. Add shared helper `_is_placeholder_url(url: str) -> bool` detecting:
   - `your-backend-ngrok`
   - `example.com`
   - `placeholder`
2. Apply placeholder check to **all three** env sources before returning
3. Fallback order after filtering invalid values:
   ```
   LINKEDIN_SOCIAL_REDIRECT_URI (valid origin)
   → NGROK_URL (valid)
   → BACKEND_URL (valid)
   → http://localhost:8000
   ```
4. Log resolved URL at **INFO** when generating auth link:
   ```
   [LinkedInConnect] Unipile redirect base_url=http://localhost:8000 user_id=...
   ```

### 1.2 Environment configuration (manual step)

**File:** `backend/.env`

Comment out or replace placeholder values:
```bash
# NGROK_URL=https://your-backend-ngrok.ngrok-free.dev   ← remove or update
# LINKEDIN_SOCIAL_REDIRECT_URI=https://your-backend-ngrok... ← remove or update
# BACKEND_URL=https://your-backend-ngrok.ngrok-free.dev  ← remove or update
```

For local dev without ngrok, leave all unset → code uses `http://localhost:8000`.

Restart backend after changes.

### 1.3 Fix Unipile list_accounts response parsing

**File:** `backend/services/integrations/linkedin/unipile_client.py`  
**Method:** `list_accounts()`

**Problem:** Only reads `data["items"]`. Unipile may return accounts under a different key or as a top-level array → auto-sync gets `[]` silently.

**Changes:**
1. Add `_normalize_account_list(data: dict | list) -> list[dict]`:
   - If `data` is a list → use directly
   - Try keys: `items`, `accounts`, `data`, `objects`
   - Log warning if HTTP 200 but zero accounts parsed (include top-level keys)
2. Log: `[UnipileClient] Listed N accounts (raw_keys=...)`

### 1.4 Improve auto-sync observability

**File:** `backend/services/integrations/linkedin_oauth.py`  
**Method:** `try_sync_unipile_accounts()`

**Changes:**
1. Log when `items` is empty after successful API call:
   ```
   WARNING [LinkedInConnect] Unipile sync found 0 accounts for user_id=...
   ```
2. Log recovery path when linking latest account (already exists — verify visible at WARNING)
3. On success, log stored `account_id`

### 1.5 Verify existing callback + webhook handlers

**Files (no logic change expected — verify only):**
- `backend/api/linkedin_social_routes.py` — `_resolve_linkedin_callback_user` reads `name` param ✅
- `backend/api/unipile_webhook_routes.py` — `POST /api/unipile/webhook` ✅

**Verify:** Callback HTML posts `LINKEDIN_OAUTH_SUCCESS` to `FRONTEND_URL` / `OAUTH_CALLBACK_ALLOWED_ORIGINS`.

### Phase 1 Success Criteria

| Test | Expected |
|------|----------|
| Click Connect LinkedIn | Log shows `redirect base_url=http://localhost:8000` (or live ngrok) |
| Complete Unipile auth | Browser loads ALwrity callback HTML (not ngrok error) |
| Backend logs | `[LinkedInConnect] Unipile callback succeeded` + `Stored Unipile credentials` |
| Refresh page (no reconnect) | Auto-sync links existing Unipile account if callback missed |
| `GET /connection/status` | `connected: true`, `provider: "unipile"` |

---

## Phase 2: Backend Profile Data for Connected UI

**Priority:** High  
**Estimated Time:** 1–2 hours  

### 2.1 Enrich connection status with profile fields

**Problem:** `GET /connection/status` returns `account_name` but not `avatar_url`. Frontend must make a second call to `/accounts` for avatar.

**Option A (Recommended — minimal):** Rely on existing `GET /api/linkedin-social/accounts` which already returns `avatar_url` via `UnipileProvider.list_accounts()` and `resolve_account_avatar_url()`.

**Option B (Optional enhancement):** Add `avatar_url` to `LinkedInConnectionStatusResponse` by fetching from Unipile on status check when provider is unipile.

**Recommendation:** Use Option A — `useLinkedInSocialConnection` already loads accounts when connected. Extend frontend types only.

### 2.2 Fix Unipile account field mapping

**File:** `backend/services/integrations/linkedin/unipile_provider.py`  
**Method:** `list_accounts()`

**Changes:**
1. Map additional Unipile avatar field names:
   - `profile_picture_url`
   - `picture_url`
   - nested `profile.picture_url` (if present)
2. Map display name fields (avoid confusing hosted-auth `name` with display name):
   - Prefer `username`, `display_name`, `profile_name`
   - Fall back to stored `account_name` from DB via oauth service if list item name equals Clerk user id (`user_*`)
3. After list, if avatar missing, call `get_account(account_id)` for primary account (same pattern as `resolve_account_avatar_url`)

### 2.3 Store account_name on callback

**File:** `backend/services/integrations/linkedin_oauth.py`  
**Method:** `handle_unipile_callback()`

**Verify:** `get_account()` maps Unipile fields correctly:
```python
account_name = (
    account_data.get("username")
    or account_data.get("display_name")
    or account_data.get("name")  # only if not user_* pattern
)
```

Do not store Clerk `user_id` as display name when Unipile returns it in `name`.

### Phase 2 Success Criteria

| Test | Expected |
|------|----------|
| `GET /api/linkedin-social/accounts` (Unipile) | Returns `username` + `avatar_url` for connected account |
| `GET /connection/status` | Returns `account_name` = real LinkedIn name (e.g. "Umesh Sharma") |

---

## Phase 3: Frontend Connected Profile UI (Unipile)

**Priority:** High  
**Estimated Time:** 2–3 hours  

### 3.1 Provider-aware connected state routing

**File:** `frontend/src/components/LinkedInWriter/components/LinkedInConnectionPlaceholder.tsx`

**Current:**
```tsx
if (connected) {
  return <LinkedInAnalyticsDashboard ... />;
}
```

**Target:**
```tsx
if (connected) {
  if (provider === 'unipile') {
    return <LinkedInConnectedProfileCard ... />;
  }
  return <LinkedInAnalyticsDashboard ... />;
}
```

Pull `provider`, `primaryProfile`, `accounts` from `useLinkedInSocialConnection()`.

### 3.2 New component: `LinkedInConnectedProfileCard`

**File:** `frontend/src/components/LinkedInWriter/components/LinkedInConnectedProfileCard.tsx` (new)

**Design:** Reuse `linkedInPlaceholderCardStyles` wrapper/inner for visual consistency with disconnected state.

**Content:**
| Element | Source |
|---------|--------|
| Profile photo | `accounts[0].avatar_url` or initials fallback via `getInitials(displayName)` |
| Display name | `primaryProfile.displayName` or `status.account_name` |
| Subtitle | "Personal profile · Connected via Unipile" |
| Optional badge | Green "Connected" pill |
| Disconnect button | Same pattern as analytics dashboard (confirm dialog) |
| Error | `disconnectError` if present |

**Avatar rendering:**
```tsx
{avatarUrl ? (
  <img src={avatarUrl} alt={displayName} style={{ width: 72, height: 72, borderRadius: '50%' }} />
) : (
  <div style={{ /* circle with initials */ }}>{initials}</div>
)}
```

**Do NOT show:**
- Analytics metric grid
- Date range picker
- Org tab switcher
- Zernio-specific copy

### 3.3 Extend frontend account type

**File:** `frontend/src/api/linkedinSocial.ts`

Add missing field to `LinkedInAccount`:
```typescript
export interface LinkedInAccount {
  account_id: string;
  account_type?: string | null;
  username?: string | null;
  avatar_url?: string | null;  // ADD
  platform: string;
}
```

### 3.4 Skip analytics fetch for Unipile

**File:** `frontend/src/hooks/useLinkedInAnalyticsDashboard.ts`

Add early return in `load()`:
```typescript
if (provider === 'unipile') return;  // not used for unipile connected card
```

**Alternative (cleaner):** Do not mount `LinkedInAnalyticsDashboard` at all for Unipile (Phase 3.1) — no hook changes needed.

**Recommendation:** Phase 3.1 alone is sufficient — analytics hook never runs for Unipile.

### 3.5 Optional: shared profile hook helper

**File:** `frontend/src/hooks/useLinkedInSocialConnection.ts`

Expose convenience fields for the connected card:
```typescript
avatarUrl: accounts[0]?.avatar_url ?? null,
displayName: primaryProfile?.displayName ?? accountName ?? 'LinkedIn account',
```

### Phase 3 UI Mockup (Connected — Unipile)

```
┌─────────────────────────────────────────────────────┐
│  [gradient background — same as placeholder]        │
│                                                     │
│              ┌──────────┐                           │
│              │  (photo) │  72px circle               │
│              └──────────┘                           │
│                                                     │
│            Umesh Sharma                             │
│     Personal profile · Connected via Unipile        │
│              ● Connected                            │
│                                                     │
│         [ Disconnect LinkedIn ]                     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Phase 3 Success Criteria

| Test | Expected |
|------|----------|
| Unipile connected | Placeholder shows profile photo + name (not analytics) |
| Unipile disconnected | Shows existing Connect LinkedIn UI |
| Zernio connected | Shows existing analytics dashboard (unchanged) |
| No avatar from API | Shows initials circle fallback |
| Disconnect works | Returns to disconnected Connect UI |

---

## Phase 4: Configuration, Testing & Cleanup

**Estimated Time:** 1 hour  

### 4.1 Environment checklist

| Variable | Local (no ngrok) | Local (with ngrok) | Production |
|----------|------------------|--------------------|------------|
| `LINKEDIN_PROVIDER` | `unipile` | `unipile` | `unipile` |
| `UNIPILE_API_KEY` | set | set | set |
| `UNIPILE_DSN` | `api30.unipile.com:16037` | same | same |
| `NGROK_URL` | unset | live ngrok URL | N/A |
| `BACKEND_URL` | unset | live ngrok URL | production API URL |
| `FRONTEND_URL` | `http://localhost:3000` | same | production frontend |
| `OAUTH_CALLBACK_ALLOWED_ORIGINS` | `http://localhost:3000` | + ngrok if needed | production frontend |

### 4.2 End-to-end test plan

**Test 1 — Fresh Unipile connect**
1. Clear local Unipile credentials (disconnect or delete DB row)
2. Fix `.env`, restart backend
3. Connect LinkedIn → complete auth
4. Verify connected profile card with photo

**Test 2 — Auto-sync recovery**
1. Leave Unipile account running in dashboard
2. Clear ALwrity DB credentials only
3. Refresh LinkedIn Writer page
4. Verify auto-sync connects + profile card appears

**Test 3 — Zernio regression**
1. Set `LINKEDIN_PROVIDER=zernio`
2. Connect existing Zernio flow
3. Verify analytics dashboard still loads

**Test 4 — Disconnect**
1. Disconnect from profile card
2. Verify Unipile account deleted remotely (if configured)
3. Verify disconnected Connect UI returns

### 4.3 Manual cleanup (ops)

In [Unipile Dashboard](https://dashboard.unipile.com/accounts), delete duplicate LinkedIn accounts created during failed callback attempts. Keep one active account per user.

---

## Implementation Order

```
Phase 1 (Backend OAuth)     ──► Must complete first
         │
         ▼
Phase 2 (Profile data)      ──► Can parallel with Phase 3 after Phase 1
         │
         ▼
Phase 3 (Frontend UI)       ──► Depends on Phase 1 + 2 for real data
         │
         ▼
Phase 4 (Testing)           ──► Final verification
```

---

## Files to Modify (Summary)

| Phase | File | Action |
|-------|------|--------|
| 1 | `backend/services/integrations/linkedin_oauth.py` | Placeholder detection on all URL env vars; sync logging |
| 1 | `backend/services/integrations/linkedin/unipile_client.py` | Normalize list_accounts response |
| 1 | `backend/.env` | Remove placeholder ngrok URLs (manual) |
| 2 | `backend/services/integrations/linkedin/unipile_provider.py` | Avatar/name field mapping |
| 2 | `backend/services/integrations/linkedin_oauth.py` | Display name extraction on callback |
| 3 | `frontend/.../LinkedInConnectionPlaceholder.tsx` | Provider-aware routing |
| 3 | `frontend/.../LinkedInConnectedProfileCard.tsx` | **New** connected profile card |
| 3 | `frontend/src/api/linkedinSocial.ts` | Add `avatar_url` to `LinkedInAccount` type |
| 3 | `frontend/src/hooks/useLinkedInSocialConnection.ts` | Optional avatar/displayName exports |

**No changes required:**
- `LinkedInAnalyticsDashboard.tsx` (Zernio path unchanged)
- `useLinkedInAnalyticsDashboard.ts` (not mounted for Unipile)

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| localhost callback blocked by browser mixed content | Unipile redirect is https → http localhost; generally allowed for top-level navigation |
| Avatar URL CORS/hotlink blocked | Initials fallback always available |
| Unipile `name` field conflated with user_id | Explicit field priority in provider mapping |
| Multiple orphaned Unipile accounts | Auto-sync picks latest; manual dashboard cleanup |
| Zernio regression | Provider branch in placeholder; no changes to analytics path |

---

## Success Criteria (Overall)

- [ ] Unipile OAuth completes without ngrok offline error
- [ ] `connected: true` in ALwrity after auth or page refresh
- [ ] Connected placeholder shows LinkedIn profile photo and real name
- [ ] No analytics API errors shown for Unipile users
- [ ] Zernio analytics dashboard unchanged
- [ ] Disconnect flow works from profile card

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-06-18 | Implementation Plan | Initial plan from RCA + connected UI requirement |

---

**End of Implementation Plan**
