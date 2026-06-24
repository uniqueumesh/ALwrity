# Unipile Post-Connect UX & Disconnect Behavior Plan

## Document Information

**Date:** 2026-06-18  
**Status:** Implementation Plan (Pending Review)  
**Based On:** Successful Unipile connection + user-reported UX/disconnect issues  
**Priority:** High  
**Estimated Effort:** 0.5–1 day (Phases A–C)  
**Scope:** Four targeted fixes — no Phase 4 testing doc changes until review  

---

## Executive Summary

LinkedIn connection via Unipile is **working end-to-end** (credentials stored, connected profile card visible, display name correct). Four follow-up items remain:

| # | Issue | Type | Severity |
|---|-------|------|----------|
| 1 | Remove subtitle *"Personal profile · Connected via Unipile"* | UI copy | Low |
| 2 | Avatar shows initials **"US"** instead of LinkedIn profile photo | Data / API | Medium |
| 3 | Reconnect fails with *"The provider cannot accept any more requests at the moment"* | Unipile / LinkedIn rate limit + reconnect flow | High |
| 4 | ALwrity disconnect **deletes** the account on Unipile (not local-only) | Backend behavior | High |

This plan addresses each item with root cause, recommended fix, files to change, and verification steps. **No code changes until approved.**

---

## Current State (Verified in Codebase)

### Connected UI
- Component: `frontend/src/components/LinkedInWriter/components/LinkedInConnectedProfileCard.tsx`
- Subtitle hardcoded at line ~120: `"Personal profile · Connected via Unipile"`
- Avatar: renders `<img>` when `avatarUrl` is truthy; otherwise initials circle via `getInitials(displayName)` → **"US"** for "Umesh Sharma"

### Avatar data path
```
GET /api/linkedin-social/accounts
  → UnipileProvider.list_accounts()
  → UnipileClient.list_accounts() + get_account()
  → unipile_avatar_url_from_item() on account payload
  → frontend useLinkedInSocialConnection.avatarUrl
```

Current avatar field mapping checks: `profile_picture`, `avatar_url`, `profile_picture_url`, `picture_url`, nested `profile.*`.  
**Unipile account objects may not include photo URLs** — photos often live on the **Users Profile API**, not the Account object.

### Disconnect behavior
- `LinkedInOAuthService.disconnect_user()` (`backend/services/integrations/linkedin_oauth.py` ~790–835)
- For `LINKEDIN_PROVIDER=unipile`: calls `UnipileClient.delete_account(unipile_account_id)` **before** revoking local DB token
- Zernio path explicitly **preserves** remote accounts (`zernio_accounts_preserved=true` in logs)
- **Asymmetry:** Unipile disconnect = full remote deletion; Zernio disconnect = local unlink only

### Reconnect / auth link generation
- `generate_authorization_url()` always calls `create_hosted_auth_link()` with `type: "create"`
- Never uses `reconnect_account()` / `type: "reconnect"` even when a prior `unipile_account_id` exists
- Each "Connect" attempt can register a **new** LinkedIn account on Unipile

### Historical context (from prior RCAs)
- Multiple **duplicate** LinkedIn accounts may exist on the Unipile dashboard from earlier failed callback attempts
- LinkedIn / Unipile may throttle or reject new auth when too many accounts or rapid retries occur

---

## Phase A: UI Copy Cleanup

**Priority:** Low  
**Estimated Time:** 15 minutes  

### A.1 Remove provider subtitle

**Problem:** User does not want *"Personal profile · Connected via Unipile"* shown on the connected card.

**Change:**
- **File:** `frontend/src/components/LinkedInWriter/components/LinkedInConnectedProfileCard.tsx`
- Remove the `<p>` element containing the subtitle (keep name, Connected badge, disconnect button)

**Optional (not requested):** Keep a shorter neutral line such as *"LinkedIn connected"* — **skip unless user asks**.

### Phase A Success Criteria

| Test | Expected |
|------|----------|
| Unipile connected | Name + avatar/initials + Connected badge + Disconnect — **no Unipile subtitle** |
| Zernio connected | Unipile card not shown; analytics dashboard unchanged |

---

## Phase B: Real LinkedIn Profile Photo

**Priority:** Medium  
**Estimated Time:** 2–4 hours  

### B.1 Root cause analysis

Display name **"Umesh Sharma"** resolves correctly → Unipile account + callback name mapping works.  
Avatar is **null/empty** in API response → frontend falls back to initials **"US"**.

Likely causes (investigate in order):

1. **Account API lacks photo fields** — `GET /api/v1/accounts/{id}` returns `name`, `status`, etc., but not `profile_picture_url`
2. **Field name mismatch** — Unipile uses different keys than currently mapped (e.g. `public_picture_url`, `picture`, nested `connection_params`)
3. **Photo only on Users API** — Unipile docs: profile photos on User Profile (`GET /api/v1/users/{identifier}` or v2 `GET /v2/:account_id/users/me`) with `profile_picture_url` / `public_picture_url`
4. **LinkedIn CDN URL blocked in browser** — less likely (would show broken image, not initials)

### B.2 Investigation step (before coding)

1. With a connected user, call backend or Unipile directly:
   - `GET /api/v1/accounts/{unipile_account_id}` — log **all top-level keys**
   - `GET /api/v1/users/me?account_id={id}` (or equivalent per Unipile v1 docs) — check for `profile_picture_url`
2. Compare response to `unipile_avatar_url_from_item()` mapping in `unipile_provider.py`
3. Document actual field names in this plan or a short RCA addendum

### B.3 Recommended implementation

**Option 1 (Preferred): Fetch own profile via Unipile Users API**

| Step | File | Action |
|------|------|--------|
| 1 | `backend/services/integrations/linkedin/unipile_client.py` | Add `get_own_profile(account_id)` → `GET /api/v1/users/me` (or v2 equivalent for your DSN) |
| 2 | `backend/services/integrations/linkedin/unipile_provider.py` | In `list_accounts()` / `_build_account_from_item()`, if avatar still missing after `get_account()`, call `get_own_profile()` |
| 3 | `unipile_provider.py` | Map `profile_picture_url`, `profile_picture_url_large`, `public_picture_url`, `public_picture_url_large` |
| 4 | Optional | Persist `avatar_url` in SQLite on callback for faster status loads |

**Option 2 (Quick test): Expand account-object field mapping only**

- Add logging of raw account JSON at INFO on first connect
- Extend `unipile_avatar_url_from_item()` with any keys found in investigation
- **May be insufficient** if photos are never on the account object

**Option 3 (Frontend fallback — not recommended alone)**

- Proxy LinkedIn image through backend — only needed if CORS/hotlink blocks `<img src>`
- Do not implement until B.2 confirms a valid URL exists server-side

### B.4 Frontend

No UI logic change required if backend returns `avatar_url` on `GET /accounts`.  
Existing `LinkedInConnectedProfileCard` already renders `<img>` when `avatarUrl` is set.

### Phase B Success Criteria

| Test | Expected |
|------|----------|
| `GET /api/linkedin-social/accounts` | `avatar_url` is a valid HTTPS LinkedIn/Unipile CDN URL |
| Connected card | Shows circular profile photo (not "US" initials) |
| Avatar load failure | Graceful fallback to initials (keep current behavior) |

---

## Phase C: Disconnect & Reconnect Behavior

**Priority:** High  
**Estimated Time:** 2–4 hours (+ manual Unipile dashboard cleanup)  

### C.1 Issue 4 — Disconnect removes Unipile account

**Current behavior (by design in Phase 1):**
```python
# linkedin_oauth.py disconnect_user()
client.delete_account(creds.unipile_account_id)  # remote delete
revoke_token(user_id)                             # local revoke
```

**User expectation:** Disconnect in ALwrity should **unlink locally** (like Zernio) without destroying the Unipile/LinkedIn connection. Reconnect should reattach to the same remote account when possible.

**Recommended change:**

| Behavior | Zernio (today) | Unipile (target) |
|----------|----------------|------------------|
| ALwrity "Disconnect" | Local token revoke only | Local token revoke only (**default**) |
| Unipile dashboard account | Preserved | Preserved |
| Optional full unlink | N/A | Env flag `UNIPILE_DELETE_ON_DISCONNECT=true` |

**Files:**
- `backend/services/integrations/linkedin_oauth.py` — `disconnect_user()`: skip `delete_account()` unless env flag set
- `backend/api/linkedin_social_routes.py` — disconnect response message: *"Disconnected from ALwrity"* vs *"Removed from Unipile"*
- `backend/.env.example` or docs — document flag

**UI copy (optional):** Change button tooltip/confirm to: *"Disconnect from ALwrity? Your LinkedIn account stays connected in Unipile."*

### C.2 Issue 3 — Reconnect error from Unipile hosted auth

**Error shown:** *"The provider cannot accept any more requests at the moment. Please try again later."*  
**Where:** Unipile hosted auth popup (LinkedIn credentials tab) — **not** an ALwrity error.

**Likely root causes (combined):**

1. **Remote account deleted on disconnect (C.1)** — user must create a brand-new LinkedIn connection; LinkedIn/Unipile treats this as a new auth session
2. **Duplicate accounts on Unipile dashboard** — prior failed callbacks created multiple LinkedIn accounts; plan limits or anti-abuse may block new `type: "create"` attempts
3. **LinkedIn rate limiting** — too many connect/disconnect cycles in a short window (especially with credential-based hosted auth)
4. **Unipile plan quota** — trial/sandbox account limits on connected LinkedIn accounts
5. **Always using `type: "create"`** — never `reconnect` when a valid remote account still exists

### C.3 Recommended reconnect flow

```
User clicks Connect
  → Check local DB for prior unipile_account_id (inactive row optional)
  → List Unipile accounts; match by name=user_id or stored account_id
  → If remote account exists and status OK:
       create_hosted_auth_link(type="reconnect", reconnect_account=id)
     Else:
       create_hosted_auth_link(type="create")
  → Redirect user to hosted auth URL
```

**Files:**
- `backend/services/integrations/linkedin_oauth.py` — `generate_authorization_url()`: branch create vs reconnect
- `backend/services/integrations/linkedin/unipile_client.py` — `reconnect_account()` already exists; wire it up
- `backend/services/integrations/linkedin_oauth.py` — `try_sync_unipile_accounts()`: on reconnect path, prefer matching existing remote account before create

### C.4 Manual ops (immediate, no code)

Before retesting reconnect:

1. Open [Unipile Dashboard → Accounts](https://dashboard.unipile.com/accounts)
2. **Delete duplicate** LinkedIn accounts (keep one healthy account per user if any remain)
3. Wait **15–60 minutes** if LinkedIn rate limit was hit
4. Retry connect — prefer **Cookies** tab in hosted auth if Credentials tab keeps failing (Unipile docs: extension/cookie path for LinkedIn)

### C.5 Optional hardening

- Log Unipile hosted-auth `type` (create vs reconnect) at INFO when generating auth URL
- Surface user-friendly ALwrity message when auth link creation fails (502) vs Unipile popup errors (out of our control)
- Webhook handler: on `CREDENTIALS` status, prompt reconnect link using `type: "reconnect"` (future)

### Phase C Success Criteria

| Test | Expected |
|------|----------|
| Disconnect from ALwrity | Local `connected: false`; Unipile dashboard account **still present** (default) |
| Reconnect (same user) | Uses reconnect link OR auto-sync reattaches without new hosted auth |
| Reconnect after cleanup | Hosted auth succeeds; no provider rate-limit error (after cooldown) |
| `UNIPILE_DELETE_ON_DISCONNECT=true` | Full remote delete (explicit opt-in only) |

---

## Implementation Order

```
Phase A (UI subtitle)     ──► Immediate, zero risk
         │
         ▼
Phase B (Profile photo)   ──► Requires B.2 investigation log first
         │
         ▼
Phase C (Disconnect)      ──► Should precede reconnect testing
         │
         ▼
Phase C (Reconnect flow)  ──► Depends on C.1 + dashboard cleanup
```

**Recommended sequence for user testing:**
1. Manual Unipile dashboard cleanup (C.4)
2. Implement C.1 (local-only disconnect)
3. Implement C.3 (reconnect vs create)
4. Implement B (avatar)
5. Implement A (subtitle removal) — can ship anytime

---

## Files to Modify (Summary)

| Phase | File | Action |
|-------|------|--------|
| A | `frontend/.../LinkedInConnectedProfileCard.tsx` | Remove subtitle `<p>` |
| B | `backend/.../unipile_client.py` | Add `get_own_profile()` (if investigation confirms) |
| B | `backend/.../unipile_provider.py` | Users API avatar fallback + field mapping |
| B | `backend/.../linkedin_oauth.py` | Optional: store avatar on callback |
| C | `backend/.../linkedin_oauth.py` | Local-only disconnect default; reconnect branch in auth URL |
| C | `backend/.env` | Document `UNIPILE_DELETE_ON_DISCONNECT` (optional) |
| C | `frontend/.../LinkedInConnectionPlaceholder.tsx` | Optional: clarify disconnect confirm copy |

---

## Out of Scope (This Plan)

- Unipile analytics / publishing (future migration phases)
- Replacing hosted auth with custom cookie auth
- Automatic duplicate-account cleanup job on Unipile
- Phase 4 E2E test doc updates (separate review)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Users API adds latency to `/accounts` | Cache avatar URL in DB on first fetch |
| Orphan Unipile accounts accumulate | Document manual cleanup; future admin tool |
| LinkedIn continues rate-limiting | Backoff messaging; use reconnect not create |
| Storing avatar URL in DB goes stale | Refresh on connect + periodic sync |

---

## Approval Checklist

- [ ] Phase A approved (subtitle removal)
- [ ] Phase B investigation completed (log raw Unipile account + user profile JSON)
- [ ] Phase C.1 approved (local-only disconnect as default)
- [ ] Phase C.3 approved (create vs reconnect branching)
- [ ] Manual Unipile dashboard cleanup done

---

## References

- Prior plan: `docs/UNIPILE_CONNECTION_AND_PROFILE_UI_FIX_PLAN.md` (Phases 1–3 complete)
- Disconnect code: `backend/services/integrations/linkedin_oauth.py` → `disconnect_user()`
- Auth link code: `backend/services/integrations/linkedin_oauth.py` → `generate_authorization_url()`
- Unipile hosted auth reconnect: https://developer.unipile.com/docs/hosted-auth
- Unipile user profile / photo: https://developer.unipile.com/docs/retrieving-users
- Unipile account management: https://developer.unipile.com/docs/connect-accounts
