# Unipile Own-Profile Request Analysis & Fix Plan

**Date:** 2026-06-18  
**Status:** Implemented (2026-06-18) — two-step v1 fetch in `unipile_client.py` / `unipile_provider.py`  
**Related:** `docs/linkedin/linkedin-analysis-context/Phase 1 – Acquire Data.md`  
**Trigger:** Live fetch returns `object: AccountOwnerProfile`, `is_self: null` — not the enriched `UserProfile` assumed in early Phase 1 docs.

---

## 1. Executive Summary

| Finding | Detail |
|---------|--------|
| **Root cause (high confidence)** | ALwrity calls **`GET /api/v1/users/me`** (Retrieve **own profile**). Unipile documents this route as returning **`AccountOwnerProfile`**, not `UserProfile`. The OpenAPI spec for this route does **not** define `linkedin_sections`. |
| **Sections param ignored** | `linkedin_sections=*` is documented only on **`GET /api/v1/users/{identifier}`** (Retrieve **a profile**). Sending it to `/users/me` is likely a no-op. |
| **API version in use** | **v1 only** — all paths are under `https://{UNIPILE_DSN}/api/v1/...`. ALwrity does **not** call v2 (`https://api.unipile.com/v2/{account_id}/users/...`). |
| **Minimal fix direction (v1)** | For full LinkedIn sections, call **`GET /api/v1/users/{identifier}?account_id=...&linkedin_sections=*`** using the connected user’s **`public_identifier`** or **`provider_id`**, not `/users/me`. |
| **Alternative (v2)** | **`GET /v2/{account_id}/users/me?with_sections=linkedin_*`** — different base URL, schema, and normalizer updates. Larger migration. |

---

## 2. Complete Execution Path (Current Code)

### 2.1 Call chain (Phase 1 fetch path)

```
CLI: linkedin_fetch_profile.py
  └─ UnipileProvider.fetch_own_linkedin_profile(user_id, linkedin_sections="*")
       ├─ LinkedInOAuthService.resolve_credentials(user_id)
       │    └─ reads unipile_account_id from linkedin_oauth_tokens (SQLite)
       └─ UnipileClient.get_own_profile(account_id, linkedin_sections="*")
            └─ httpx.AsyncClient.get(url, params=..., headers=...)
```

### 2.2 Avatar-only path (no sections — same endpoint)

```
UnipileProvider._resolve_avatar_url()
  └─ UnipileClient.get_own_profile(account_id)   # linkedin_sections omitted (None)
       └─ same GET /api/v1/users/me?account_id=...
```

---

## 3. Exact HTTP Request (What ALwrity Sends Today)

### 3.1 Method and URL

| Item | Value |
|------|--------|
| **HTTP method** | `GET` |
| **Path** | `/api/v1/users/me` |
| **Full URL pattern** | `https://{UNIPILE_DSN}/api/v1/users/me` |
| **Default DSN** | `api30.unipile.com:16037` (`DEFAULT_UNIPILE_DSN` in `unipile_client.py`) |
| **Override** | `UNIPILE_DSN` env var |

**Example (conceptual):**

```http
GET https://api30.unipile.com:16037/api/v1/users/me?account_id=YOUR_UNIPILE_ACCOUNT_ID&linkedin_sections=*
X-API-KEY: {UNIPILE_API_KEY}
Accept: application/json
Content-Type: application/json
```

### 3.2 API version

**v1** — evidenced by:

- Path prefix `/api/v1/`
- `account_id` as **query** parameter
- Base URL built from `UNIPILE_DSN` (hosted instance), not `https://api.unipile.com`

No v2 paths exist in `unipile_client.py`.

### 3.3 Query parameters

Built in `UnipileClient.get_own_profile()`:

```python
params: dict[str, str] = {"account_id": account_id}
if linkedin_sections is not None:
    params["linkedin_sections"] = linkedin_sections
```

| Parameter | When sent | Value (Phase 1 fetch) |
|-----------|-----------|------------------------|
| `account_id` | Always | Unipile account ID from OAuth credentials |
| `linkedin_sections` | When argument is not `None` | `"*"` (string) from `fetch_own_linkedin_profile` default |

**When omitted** (avatar lookup): only `account_id`.

### 3.4 How `linkedin_sections="*"` is transformed

| Step | What happens |
|------|----------------|
| 1 | `fetch_own_linkedin_profile(..., linkedin_sections="*")` passes Python string `"*"`. |
| 2 | `get_own_profile` assigns `params["linkedin_sections"] = "*"` (no parsing, no list conversion). |
| 3 | `httpx` URL-encodes query string → `linkedin_sections=%2A` (or literal `*` depending on client). |
| 4 | **No** transformation to v2 `with_sections`, **no** array repetition (`linkedin_sections=*&linkedin_sections=experience`), **no** `linkedin_*` prefix. |

**OpenAPI note:** On **`GET /users/{identifier}`**, Unipile defines `linkedin_sections` as an **array** of enum values (`*`, `experience`, `skills`, etc.). Sending a single string `*` often still works in practice (per Unipile docs curl examples), but the param is **not defined at all** on **`GET /users/me`**.

### 3.5 Headers

From `_auth_headers()`:

```http
X-API-KEY: {UNIPILE_API_KEY}
Accept: application/json
Content-Type: application/json
```

---

## 4. Unipile API Contract Comparison

### 4.1 Two different v1 “profile” routes

Unipile v1 has **two distinct GET routes** that are easy to conflate because both can conceptually mean “me”:

| Route | OpenAPI operation | Documented response `object` | `linkedin_sections` in spec? |
|-------|-------------------|------------------------------|------------------------------|
| **`GET /api/v1/users/me`** | `UsersController_getAccountOwnerProfile` | **`AccountOwnerProfile`** | **No** — only `account_id` query param |
| **`GET /api/v1/users/{identifier}`** | `UsersController_getProfileByIdentifier` | **`UserProfile`** | **Yes** — array param, supports `*`, section names, `*_preview` |

References:

- [Retrieve own profile](https://developer.unipile.com/reference/userscontroller_getaccountownerprofile) → `AccountOwnerProfile`
- [Retrieve a profile](https://developer.unipile.com/reference/userscontroller_getprofilebyidentifier) → `UserProfile` + `linkedin_sections`
- [Retrieving users (guide)](https://developer.unipile.com/docs/retrieving-users) — full example uses **`/users/satyanadella?linkedin_sections=*`**, not `/users/me`

### 4.2 Why you see `AccountOwnerProfile` (not `UserProfile`)

This is **expected** for `GET /users/me`:

- Unipile labels the connected account owner response as **`AccountOwnerProfile`**.
- It is a **different schema** from third-party **`UserProfile`** (Satya Nadella example in docs).
- **`is_self`** is documented on **`UserProfile`** (third-party views). It is **not** in the **`AccountOwnerProfile`** LinkedIn OpenAPI schema — hence `null` / absent in JSON is normal.

**Conclusion:** The response type is not a bug in ALwrity parsing — it reflects the **correct endpoint’s documented object type**.

### 4.3 What `AccountOwnerProfile` typically includes vs full `UserProfile`

**AccountOwnerProfile (own profile route)** — base owner record:

- Identity: `first_name`, `last_name`, `headline`, `location`, `public_identifier`, `provider_id`
- Account-ish flags: `premium`, `open_profile`, `organizations`, recruiter/sales_navigator blocks
- Photos: `profile_picture_url`, sometimes `public_profile_url`
- May include **some** counts if Unipile merges them — but **not** the rich section arrays documented under `UserProfile` with `linkedin_sections`

**UserProfile (identifier route + `linkedin_sections=*`)** — full LinkedIn sections:

- `summary` (About), `work_experience[]`, `education[]`, `skills[]`, `languages[]`, `certifications[]`, `recommendations`, `follower_count`, `connections_count`, `*_total_count`, etc.

If your live response lacks `work_experience`, `education`, `skills`, `summary`, the likely reason is **wrong route for sections**, not a failed normalizer.

---

## 5. Comparison with Unipile v2 `GET /v2/{account_id}/users/me`

ALwrity **does not** send this request today. Documented v2 contract for comparison:

| Aspect | ALwrity today (v1) | Unipile v2 |
|--------|-------------------|------------|
| **URL** | `https://{DSN}/api/v1/users/me` | `https://api.unipile.com/v2/{account_id}/users/me` |
| **Account scoping** | Query: `?account_id=` | Path: `{account_id}` (pattern `acc_xxx`) |
| **Sections param** | `linkedin_sections=*` (on wrong route) | `with_sections=linkedin_*` (repeatable query array) |
| **Response model** | `AccountOwnerProfile` (v1 `/users/me`) | Social profile + `specifics.linkedin.*` (different field names) |
| **Field renames** | v1 names (`summary`, `work_experience`, …) | v2 names (`bio`, `experience`, `followers_count`, …) |
| **`is_self`** | N/A on AccountOwnerProfile | Removed in v2 migration guide |

Reference: [Users API migration (v1 → v2)](https://developer.unipile.com/v2.0/docs/migration-users-api), [Get a User Profile v2](https://developer.unipile.com/v2.0/reference/getuserprofile)

**Important:** v2 uses a **different host** (`api.unipile.com`) and **account ID format** (`acc_xxx`) vs typical v1 DSN account IDs. Migrating to v2 is **not** a one-line param rename — it is a client + normalizer migration.

---

## 6. Codebase Assumptions Audit

| Location | Assumption | Correct? |
|----------|------------|----------|
| `unipile_client.get_own_profile` docstring | Returns “UserProfile dictionary” | **Misleading** — `/users/me` returns `AccountOwnerProfile` |
| `unipile_provider.fetch_own_linkedin_profile` docstring | “full LinkedIn UserProfile” via `/users/me` + sections | **Incorrect route for sections** |
| `Phase 1 – Acquire Data.md` (early text) | `users/me` + `linkedin_sections=*` → full UserProfile | **Partially wrong** — sections param belongs to `/users/{identifier}` |
| `linkedin_fetch_profile.py` gate (updated) | Accepts `AccountOwnerProfile` | **Correct** for current HTTP call |
| `profile_service.normalize_unipile_profile` | Maps `work_experience`, `summary`, etc. | **Correct mapping** — but only if raw payload contains those fields |
| `get_user_profile()` | No `linkedin_sections` param at all | **Gap** — even identifier route wouldn’t fetch sections today |

**Provider HTTP logic is not “wrong”** relative to its implementation — it faithfully calls `/users/me`. The **product assumption** (that this returns a section-rich `UserProfile`) does not match Unipile’s v1 API split.

---

## 7. Root Cause Statement

> Phase 1 fetch uses **`GET /api/v1/users/me`**, which Unipile defines as **Retrieve own profile** returning **`AccountOwnerProfile`**. The **`linkedin_sections`** parameter is documented only on **`GET /api/v1/users/{identifier}`** (Retrieve a profile → **`UserProfile`**). ALwrity passes `linkedin_sections=*` to `/users/me`, where it is **not part of the official contract** and is likely **ignored**, so the response stays a **light owner profile** without guaranteed experience, education, skills, about, etc.

---

## 8. Recommended Fix Strategy (No Code Yet)

### Phase A — Confirm root cause (1 CLI experiment, no refactor)

Run these **three** requests manually (curl or temporary logging) with the same `account_id`:

| # | Request | Expected if hypothesis correct |
|---|---------|--------------------------------|
| A1 | `GET /api/v1/users/me?account_id=X` | `object: AccountOwnerProfile`, no/minimal sections |
| A2 | `GET /api/v1/users/me?account_id=X&linkedin_sections=*` | Same as A1 (sections still absent) |
| A3 | `GET /api/v1/users/{public_identifier}?account_id=X&linkedin_sections=*` | `object: UserProfile`, `work_experience`, `education`, `skills`, `summary`, counts |

Use `public_identifier` from A1 response (or `provider_id` per Unipile docs).

**Pass criteria:** A3 returns section fields A1 lacks.

Optional A4: `GET /api/v1/users/me?account_id=X&linkedin_sections=*` where `{identifier}` is literally `me` on the **identifier** route — only if Unipile supports `me` there with sections (undocumented; test before relying on it).

---

## 9. Minimal Code Change Plan (After Phase A Passes)

### Option 1 — v1 two-step (recommended minimal change)

**Scope:** Extend existing v1 client only; keep `UNIPILE_DSN` and normalizer field names.

| Step | Change | File |
|------|--------|------|
| 1 | Add `linkedin_sections: Optional[str] = None` to `get_user_profile()` and append to `params` when set | `unipile_client.py` |
| 2 | In `fetch_own_linkedin_profile()`: (a) `GET /users/me` → read `public_identifier` or `provider_id`; (b) `GET /users/{id}?linkedin_sections=*` | `unipile_provider.py` or new helper in `profile_service.py` |
| 3 | Keep avatar path on lightweight `/users/me` without sections (1 call) | `unipile_provider._resolve_avatar_url` — unchanged |
| 4 | Update CLI gate Step 1.1: expect `UserProfile` on **full fetch path** (or document two-step) | `linkedin_fetch_profile.py` |
| 5 | Save real A3 JSON as fixture; re-run Step 1.2 normalizer gate | `docs/linkedin/fixtures/` |
| 6 | Update Phase 1 doc: `/users/me` = owner metadata; `/users/{id}` + sections = full profile | `Phase 1 – Acquire Data.md` |

**API call budget:** 2 Unipile calls per full profile refresh (acceptable for Phase 1; cache in Step 1.3 avoids repeats).

**Alternative single-call variant:** If credentials already store `public_identifier`, skip step (a) when identifier known.

### Option 2 — v1 single-call (if A4 passes in staging)

Replace `get_own_profile` full-fetch path with:

```http
GET /api/v1/users/me?account_id=X&linkedin_sections=*
```

only if Unipile returns `UserProfile` on the **identifier** route with `identifier=me`. **Do not implement until A4 confirmed** — today’s dedicated `/users/me` route returns `AccountOwnerProfile`.

### Option 3 — v2 migration (defer)

- New base URL / account ID format
- `with_sections=linkedin_*` instead of `linkedin_sections=*`
- Rewrite `normalize_unipile_profile()` for v2 field names (`bio`, `experience`, `followers_count`, …)
- Larger than Phase 1 needs; plan as separate epic

---

## 10. Implementation Steps (Ordered)

```
Step 0  Manual A1/A2/A3 curl tests — confirm root cause          [YOU / staging]
Step 1  Add linkedin_sections to get_user_profile()               [1 file, ~10 lines]
Step 2  fetch_own_linkedin_profile: me → identifier full fetch      [provider, ~25 lines]
Step 3  Re-run CLI --dry-run --print-json — verify UserProfile    [gate]
Step 4  Re-run --print-normalized — verify section mapping        [Step 1.2 gate]
Step 5  Update Phase 1 doc + UNIPILE mapping doc                  [docs only]
Step 6  Continue Step 1.3 persistence (unchanged architecture)    [next phase]
```

**Do not start Steps 1–2 until Step 0 passes.**

---

## 11. Phase 1 Doc Corrections (when updating docs)

| Current doc text | Correction |
|------------------|------------|
| Single call `GET /users/me` + `linkedin_sections=*` returns full UserProfile | Split: `/users/me` → AccountOwnerProfile; full sections via `/users/{identifier}` + `linkedin_sections` |
| Expect `is_self: true` on `/users/me` | Remove — not in AccountOwnerProfile schema |
| Response type `UserProfile` | Full acquire path should target `UserProfile` from identifier route |
| v2 `with_sections` | Note as future migration; ALwrity uses v1 today |

---

## 12. Risk Notes

| Risk | Mitigation |
|------|------------|
| LinkedIn rate limits on profile visits | Use own `public_identifier`; set `notify=false` on identifier route if supported |
| Two calls per refresh | Cache normalized profile (Phase 1 Step 1.3) |
| `linkedin_sections` as string vs array | If `*` fails on identifier route, try repeated params or SDK-style array encoding |
| Throttled sections (`throttled_sections` in response) | Log warning; retry with `*_preview` subset per Unipile docs |
| Normalizer already handles both `premium` and `is_premium` | Keep — AccountOwnerProfile may use `premium`/`open_profile` |

---

## 13. References

- [Unipile — Retrieve own profile (v1 `/users/me`)](https://developer.unipile.com/reference/userscontroller_getaccountownerprofile)
- [Unipile — Retrieve a profile (v1 `/users/{identifier}`)](https://developer.unipile.com/reference/userscontroller_getprofilebyidentifier)
- [Unipile — Retrieving users (guide)](https://developer.unipile.com/docs/retrieving-users)
- [Unipile — Users API v1 → v2 migration](https://developer.unipile.com/v2.0/docs/migration-users-api)
- [Unipile — Get a User Profile (v2)](https://developer.unipile.com/v2.0/reference/getuserprofile)
- ALwrity: `backend/services/integrations/linkedin/unipile_client.py` (`get_own_profile`, `get_user_profile`)
- ALwrity: `backend/services/integrations/linkedin/unipile_provider.py` (`fetch_own_linkedin_profile`)
