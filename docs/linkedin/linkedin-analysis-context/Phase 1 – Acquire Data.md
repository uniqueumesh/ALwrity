# Cursor Development Rules

Before implementing this phase:

1. Read the existing implementation first.
2. Reuse existing services whenever possible.
3. Never duplicate code.
4. Follow ALwrity modular architecture.
5. Implement detailed logging.
6. Implement exception handling.
7. Preserve existing Unipile OAuth connect/callback flow.
8. Complete one phase only.
9. Do not implement future phases.
10. Ask if architectural conflicts are found.

# ALwrity LinkedIn Writer
# Phase 1 – Acquire Data

**Updated:** 2026-06-18  
**Provider:** Unipile only  
**Related:** `docs/linkedin/UNIPILE_LINKEDIN_ANALYSIS_GOALS_AND_API_MAPPING.md`

---

# Objective

Build the foundation for ALwrity's future AI-powered LinkedIn Profile Understanding.

This phase is responsible for fetching all **own-profile** information from the connected user's LinkedIn account via **Unipile** and exposing a normalized ALwrity profile object for Phases 2–6.

No AI logic should be implemented in this phase.

No profile analysis should be implemented.

No topic generation should be implemented.

The only responsibility of this phase is:

> Reliably fetch, normalize and expose the **connected user's full LinkedIn UserProfile** through a **two-step Unipile v1 flow** for future phases.

**Note:** Zernio is **not** part of this pipeline. All LinkedIn analysis work depends solely on Unipile.

### Core principle — fetch once, store, reuse

Unipile must **not** be called on every page load or on every later-phase request.

| When | Unipile API | ALwrity storage |
|------|-------------|-----------------|
| First acquire / explicit refresh | ✅ Two v1 calls (see below) | Write normalized profile to DB |
| Phase 2 normalize | ❌ No API | Read stored `profile` |
| Phase 3 validate | ❌ No API | Read stored `profile_context` |
| Phase 5 AI understand | ❌ No API | Read stored `profile_context` |
| User clicks “Refresh from LinkedIn” | ✅ One call | Overwrite profile; invalidate downstream |

Phase 1 is responsible for **acquiring**, **normalizing**, and **persisting** the profile snapshot. Later phases read from ALwrity’s database only.

---

# Unipile API Strategy (Phase 1)

## Two-step v1 fetch — full UserProfile

Unipile v1 splits “own profile metadata” and “section-rich profile” across **two routes**:

| Step | Endpoint | Response `object` | Purpose |
|------|----------|-------------------|---------|
| 1 | `GET /api/v1/users/me?account_id={id}` | **`AccountOwnerProfile`** | Resolve `public_identifier` or `provider_id`; avatar lookups |
| 2 | `GET /api/v1/users/{identifier}?account_id={id}&linkedin_sections=*` | **`UserProfile`** | Full experience, skills, education, about, recommendations |

**`linkedin_sections` is only valid on step 2** — it is not in the OpenAPI spec for `/users/me`.

| Item | Value |
|------|--------|
| **Auth** | Header `X-API-KEY: {UNIPILE_API_KEY}` |
| **Base URL** | `https://{UNIPILE_DSN}` (e.g. `api30.unipile.com:16037`) |
| **Sections query** | `linkedin_sections=*` on step 2 only |
| **Notify** | `notify=false` on step 2 when fetching own profile (avoid self-notification) |
| **Full acquire response type** | `object: "UserProfile"` |

Example step 2 ([Unipile — Retrieving users](https://developer.unipile.com/docs/retrieving-users)):

```http
GET /api/v1/users/jane-doe-engineer?account_id={UNIPILE_ACCOUNT_ID}&linkedin_sections=*&notify=false
X-API-KEY: {UNIPILE_API_KEY}
Accept: application/json
```

Use the connected user's **`public_identifier`** or **`provider_id`** from step 1 — not a third-party vanity URL.

**Own-profile signal:** Step 2 for the connected user typically returns `is_self: true` on `UserProfile`. Step 1 (`AccountOwnerProfile`) does **not** include `is_self`.

### What step 2 returns

With `linkedin_sections=*`, Unipile returns the **complete UserProfile** shape (verified against [Retrieving users — full LinkedIn profile example](https://developer.unipile.com/docs/retrieving-users)):

| Category | Unipile fields (from step 2 UserProfile) |
|----------|------------------------------------------|
| **Identity** | `object`, `provider`, `provider_id`, `public_identifier`, `member_urn`, `first_name`, `last_name`, `headline`, `summary` |
| **Locale & flags** | `primary_locale` (`country`, `language`), `is_open_profile`, `is_premium`, `is_influencer`, `is_creator`, `is_relationship`, `network_distance`, `is_self` |
| **Reach** | `follower_count`, `connections_count`, `location`, `websites[]` |
| **Media** | `profile_picture_url`, `profile_picture_url_large`, `background_picture_url` |
| **Experience** | `work_experience_total_count`, `work_experience[]` (company, position, dates, location, logos, per-role skills, description) |
| **Education** | `education_total_count`, `education[]` (school, degree, dates, school logos) |
| **Skills** | `skills_total_count`, `skills[]` (`name`, `endorsement_count`) |
| **Languages** | `languages_total_count`, `languages[]` (`name`, `proficiency`) |
| **Certifications** | `certifications_total_count`, `certifications[]` |
| **Volunteering** | `volunteering_experience_total_count`, `volunteering_experience[]` |
| **Projects** | `projects_total_count`, `projects[]` |
| **Recommendations** | `recommendations` (`given_total_count`, `given[]`, `received_total_count`, `received[]`) |
| **Creator** | `hashtags[]` |

**Phase 1 acquires and normalizes all of the above** when present. Empty arrays and zero counts are valid — do not treat them as errors.

### Rate-limit note

Unipile warns that requesting many LinkedIn sections may trigger throttling. For Phase 1:

- Prefer **two calls** per refresh: lightweight `/users/me`, then `/users/{identifier}` with `linkedin_sections=*`.
- Cache normalized profile in DB (Step 1.3) so later phases never repeat Unipile calls.
- If throttled, retry with a reduced section set — log which set was used.
- Do **not** fan out to separate list endpoints (relations, posts, etc.) in Phase 1.

See also: `docs/linkedin/unipile/UNIPILE_OWN_PROFILE_REQUEST_ANALYSIS_AND_FIX_PLAN.md`

---

## Deferred Unipile endpoints (NOT Phase 1)

These are **separate** Users API routes. They are **not** part of the UserProfile payload and are **not** required for Phases 2–5.

| Unipile capability | Typical use | Phase 1 |
|--------------------|-------------|---------|
| List all relations | Full connection list / network graph | ❌ Deferred — counts already on UserProfile |
| List all followers | Paginated audience list | ❌ Deferred — `follower_count` on UserProfile |
| List all posts | Content history, posting frequency | ❌ Deferred (Phase 6+ enrichment) |
| List all comments | Engagement patterns | ❌ Deferred |
| List all reactions | Content resonance | ❌ Deferred |
| Retrieve a profile (other user) | Competitor / prospect research | ❌ Deferred |
| LinkedIn raw data proxy | Escape hatch | ❌ Deferred |

---

# Current Architecture

```
Frontend (LinkedIn Writer)
  ↓
linkedinSocial.ts
  ↓
GET /api/linkedin-social/profile          ← NEW (Phase 1)
  ↓
linkedin_social_routes.py
  ↓
profile_service.py                        ← NEW
  ↓
UnipileProvider.fetch_own_linkedin_profile()
  ↓
UnipileClient.get_own_profile()           ← step 1: AccountOwnerProfile (identifier)
  ↓
UnipileClient.get_user_profile()          ← step 2: linkedin_sections=*, notify=false
  ↓
GET /api/v1/users/{identifier}?account_id=...&linkedin_sections=*
  ↓
UserProfile (full sections)
```

## Already implemented (reuse — do not duplicate)

| Component | Location | Reuse in Phase 1 |
|-----------|----------|------------------|
| Unipile HTTP client | `unipile_client.py` | `get_own_profile()` (avatar/identifier), `get_user_profile(..., linkedin_sections=*)` |
| Unipile provider | `unipile_provider.py` | `fetch_own_linkedin_profile()` — two-step v1 flow |
| Credential resolution | `linkedin_oauth.py` | `resolve_credentials()` → `unipile_account_id` |
| Avatar helpers | `avatar_url_from_user_profile()` | Map `profile_picture_url_large` |

Do NOT modify the existing Unipile OAuth connect/callback flow.

---

# Data Pipeline — How Profile Data Flows Through ALwrity

```
                    ┌─────────────────────────────────────┐
                    │  Unipile (external — call rarely)   │
                    │  1. GET /users/me                    │
                    │  2. GET /users/{id}?linkedin_sections=* │
                    └──────────────────┬──────────────────┘
                                       │ Phase 1 only (or refresh)
                                       ▼
┌──────────────────────────────────────────────────────────────────┐
│  ALwrity SQLite — linkedin_analysis_context (per user_id)        │
│                                                                  │
│  normalized_profile      ← Phase 1 writes                        │
│  profile_context         ← Phase 2 writes (derived, no API)      │
│  profile_validation      ← Phase 3 writes (derived, no API)      │
│  user_completion         ← Phase 4 writes (user answers)         │
│  ai_profile_intelligence ← Phase 5 writes (LLM, no Unipile)      │
│  profile_content_hash    ← invalidates downstream when changed   │
│  fetched_at              ← last Unipile fetch timestamp          │
└──────────────────────────────────────────────────────────────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         ▼                             ▼                             ▼
   Phase 2 read                  Phase 3 read                  Phase 5 read
   normalized_profile            profile_context               profile_context
   → write profile_context       → write profile_validation    → write ai_profile_intelligence
```

**Rule:** Phases 2, 3, and 5 never call Unipile. They only read/write columns in `linkedin_analysis_context`.

---

# Storage in ALwrity

## Database location

Use the **same SQLite database** as LinkedIn OAuth credentials (`linkedin_oauth_tokens` in `linkedin_oauth.py`). Co-locate analysis data so one `user_id` maps to one analysis row.

Suggested new table:

```sql
CREATE TABLE IF NOT EXISTS linkedin_analysis_context (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL UNIQUE,
    unipile_account_id TEXT NOT NULL,

    -- Phase 1 (this phase)
    normalized_profile_json TEXT,          -- ALwrity normalized profile (API-safe)
    raw_userprofile_json TEXT,             -- optional internal; never expose via API
    profile_content_hash TEXT,             -- SHA-256 of normalized_profile_json
    fetched_at TIMESTAMP,                  -- last successful Unipile fetch

    -- Later phases (columns reserved; written by those phases)
    profile_context_json TEXT,             -- Phase 2
    profile_validation_json TEXT,          -- Phase 3
    user_completion_json TEXT,             -- Phase 4
    ai_profile_intelligence_json TEXT,     -- Phase 5

    profile_context_updated_at TIMESTAMP,
    ai_intelligence_updated_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_linkedin_analysis_user
    ON linkedin_analysis_context (user_id);
```

## Repository layer

Suggested file: `backend/services/integrations/linkedin/profile_repository.py`

| Method | Purpose |
|--------|---------|
| `get_analysis_row(user_id)` | Load full row or `None` |
| `save_normalized_profile(user_id, unipile_account_id, profile, raw=None)` | Upsert Phase 1 snapshot + hash + `fetched_at` |
| `get_normalized_profile(user_id)` | Read cached profile |
| `has_fresh_profile(user_id, max_age_hours=168)` | Optional TTL check (default 7 days) |
| `invalidate_downstream(user_id)` | Clear `profile_context`, `profile_validation`, `ai_profile_intelligence` when profile hash changes |

Phase 1 implements **only** the Phase 1 columns and repository methods. Later phases add their write methods to the same repository (do not create a second store).

## What gets stored vs exposed

| Data | Stored in DB | Returned by API |
|------|--------------|-----------------|
| Normalized profile (Phase 1 output) | ✅ `normalized_profile_json` | ✅ `profile` |
| Raw Unipile UserProfile | ✅ `raw_userprofile_json` (optional, internal) | ❌ Never |
| Profile context (Phase 2) | ✅ (Phase 2 writes) | ✅ (when Phase 2 done) |
| Validation (Phase 3) | ✅ (Phase 3 writes) | ✅ (when Phase 3 done) |
| AI intelligence (Phase 5) | ✅ (Phase 5 writes) | ✅ (when Phase 5 done) |

## Refresh and invalidation rules

| Trigger | Action |
|---------|--------|
| No row for `user_id` | Fetch from Unipile → normalize → save |
| CLI/API with `--refresh` or `?refresh=true` | Fetch from Unipile → save → if hash changed, `invalidate_downstream()` |
| `unipile_account_id` changed (reconnect) | Treat as stale → fetch on next acquire |
| Profile hash unchanged | Skip Unipile; serve from DB |
| TTL expired (optional, e.g. 7 days) | Fetch on next request unless user disabled auto-refresh |
| Phase 4 user answers | Merge into context; **do not** call Unipile |

When `profile_content_hash` changes after refresh, Phase 2 and Phase 5 must **recompute** their derived JSON (Phase 3 re-runs on new context). Phase 5 should skip LLM if hash unchanged and `ai_profile_intelligence_json` exists.

---

# How Later Phases Use Stored Data (No Repeated Unipile Calls)

## Phase 2 — Normalize Data

| Reads | Writes | Unipile |
|-------|--------|---------|
| `normalized_profile_json` from DB | `profile_context_json` | ❌ Never |

Flow: `build_profile_context(stored_profile)` → save `profile_context_json`. If context already exists and profile hash unchanged, return cached context.

## Phase 3 — Validate Data

| Reads | Writes | Unipile |
|-------|--------|---------|
| `profile_context_json` from DB | `profile_validation_json` | ❌ Never |

Flow: validator checks required fields (name, headline, job_title, company, about, skills|experience|education) on **Profile Context only**. Never reads raw Unipile or normalized profile directly if context exists.

## Phase 5 — Understand Data (AI)

| Reads | Writes | Unipile |
|-------|--------|---------|
| `profile_context_json` (+ Phase 4 completion if present) | `ai_profile_intelligence_json` | ❌ Never |

Flow: LLM prompt built from **Profile Context only**. If `profile_content_hash` matches stored hash and `ai_profile_intelligence_json` exists, return cached intelligence — **no LLM, no Unipile**.

## Combined API response (single endpoint, layered cache)

`GET /api/linkedin-social/profile` assembles from DB:

```json
{
  "profile": { "...": "from normalized_profile_json" },
  "profile_context": { "...": "from profile_context_json or built on demand" },
  "profile_validation": { "...": "from profile_validation_json or computed" },
  "ai_profile_intelligence": { "...": "from ai_profile_intelligence_json when Phase 5 done" },
  "meta": {
    "fetched_at": "2026-06-18T12:00:00Z",
    "profile_content_hash": "abc123...",
    "source": "cache"
  }
}
```

`meta.source` is `"cache"` or `"unipile"` so logs and UI can show whether a live fetch occurred.

---

# Scope

## In Scope

✅ Two Unipile v1 calls on acquire/refresh: `/users/me` then `/users/{identifier}` + `linkedin_sections=*`

✅ Normalize full **UserProfile** → ALwrity profile model (all sections above)

✅ **Persist** normalized profile in `linkedin_analysis_context` (SQLite)

✅ **CLI script** to fetch, test, and save profile without the HTTP UI

✅ Cache-first `GET /api/linkedin-social/profile` (optional `?refresh=true`)

✅ Logging, exception handling, `profile_service.py` + `profile_repository.py`

✅ Require connected Unipile account (`unipile_account_id`)

## Out of Scope

- AI, validation (Phase 3), context builder (Phase 2), topic generation — **implement in their phases; storage columns defined here**
- Unipile list endpoints: relations, followers, posts, comments, reactions
- Zernio integration
- Publishing (`POST /posts`)
- UI changes (except Swagger/Postman testing)
- Writing `profile_context_json`, `profile_validation_json`, or `ai_profile_intelligence_json` — **Phase 2/3/5 write those**

---

# Implementation Steps (Break Into Sub-Steps)

Phase 1 is split so you can test Unipile acquisition via CLI before wiring the HTTP endpoint.

## Step 1.1 — Unipile client (fetch only)

**Goal:** Prove Unipile returns full UserProfile via two-step v1 fetch.

- `UnipileClient.get_own_profile(account_id)` — step 1, no sections
- `UnipileClient.get_user_profile(account_id, identifier, linkedin_sections="*", notify=False)` — step 2
- `UnipileProvider.fetch_own_linkedin_profile(user_id)` — orchestrates both steps
- **No DB yet.** Log top-level keys and section counts.

**Done when:** Manual call returns `object: UserProfile` with expected sections.

## Step 1.2 — Normalizer

**Goal:** Map UserProfile → ALwrity normalized shape.

- Add `normalize_unipile_profile(raw: dict) -> dict` in `profile_service.py`
- Apply full field mapping (see below)
- **No DB yet.** Print normalized JSON in a dev helper.

**Done when:** Normalized output matches response model; no raw Unipile in output.

## Step 1.3 — Repository + DB migration

**Goal:** Persist normalized profile per user.

- Create `linkedin_analysis_context` table (see Storage section)
- Implement `profile_repository.py`: save, get, invalidate downstream
- Compute `profile_content_hash` on save

**Done when:** Save/load round-trip works for a test `user_id`.

## Step 1.4 — CLI acquire script (primary test path)

**Goal:** Fetch from Unipile, normalize, save — **without HTTP**.

Suggested script: `backend/scripts/linkedin_fetch_profile.py`

```bash
python backend/scripts/linkedin_fetch_profile.py --user-id USER_ID
python backend/scripts/linkedin_fetch_profile.py --user-id USER_ID --refresh
python backend/scripts/linkedin_fetch_profile.py --user-id USER_ID --print-json
python backend/scripts/linkedin_fetch_profile.py --user-id USER_ID --dry-run
```

**Prerequisites:** User connected via Unipile OAuth; `UNIPILE_API_KEY` and `UNIPILE_DSN` in `backend/.env`.

**Done when:** CLI acquires real profile data and persists to SQLite.

## Step 1.5 — Profile service orchestration

**Goal:** Cache-first entry point.

- `get_or_fetch_profile(user_id, refresh=False)` → returns `(profile, meta)`
- Cache hit → `meta.source = "cache"` (no Unipile HTTP)
- Cache miss or refresh → fetch, normalize, save, `meta.source = "unipile"`
- Hash change → `invalidate_downstream(user_id)`

**Done when:** Second call with `refresh=False` hits DB only.

## Step 1.6 — HTTP endpoint (cache-first)

**Goal:** Expose stored profile via API.

- `GET /api/linkedin-social/profile` (default: cache)
- `GET /api/linkedin-social/profile?refresh=true` (force Unipile)

**Done when:** Repeat Swagger requests use cache without Unipile calls.

---

# Backend Implementation (Summary)

## New service

`backend/services/integrations/linkedin/profile_service.py` — fetch + normalize only.

## Provider method

```python
async def fetch_own_linkedin_profile(self, user_id: str) -> dict[str, Any]:
    """Fetch raw UserProfile from Unipile for the connected account."""
```

1. `resolve_credentials(user_id)` → `unipile_account_id`
2. Reject if missing
3. `UnipileClient.get_own_profile(account_id, linkedin_sections="*")`
4. Return raw dict to normalizer

## Extend client

```python
async def get_own_profile(
    self,
    account_id: str,
    *,
    linkedin_sections: str = "*",
) -> dict[str, Any]:
    params = {"account_id": account_id, "linkedin_sections": linkedin_sections}
```

Optional: `GET /api/v1/accounts/{id}` pre-check via existing `get_account()`.

---

# Responsibilities

```
Resolve unipile_account_id
  ↓
Check cache (unless refresh)
  ↓
If miss → one Unipile API call → UserProfile
  ↓
Normalize → ALwrity profile object
  ↓
Persist to linkedin_analysis_context
  ↓
Return profile + meta (source: cache | unipile)
```

No AI. No validation. No Phase 2/3/5 logic in Phase 1 code.

---

# Suggested Functions

| Function | Purpose |
|----------|---------|
| `fetch_linkedin_profile(user_id)` | Live Unipile call only; returns raw UserProfile |
| `normalize_unipile_profile(raw)` | Map UserProfile → ALwrity shape |
| `get_or_fetch_profile(user_id, refresh=False)` | Cache-first orchestrator; returns profile + meta |
| `ProfileRepository.save_normalized_profile(...)` | Persist to SQLite |
| `ProfileRepository.get_normalized_profile(user_id)` | Read from SQLite |
| `ProfileRepository.invalidate_downstream(user_id)` | Clear Phase 2/3/5 derived columns on hash change |

Never expose raw Unipile JSON to the frontend or CLI `--print-json` by default (use normalized output).

---

# Unipile UserProfile → ALwrity Field Mapping

Single source: `GET /users/me?account_id=...&linkedin_sections=*`. Use sensible fallbacks; never fail on missing optional data.

## Core identity & reach

| ALwrity field | Unipile source | Notes |
|---------------|----------------|--------|
| `first_name` | `first_name` | |
| `last_name` | `last_name` | |
| `name` | `first_name` + `last_name` | Fallback: stored `account_name`; skip Clerk `user_*` |
| `headline` | `headline` | |
| `about` | `summary` | LinkedIn “About” |
| `job_title` | First `work_experience[].position` where `end` is null | Current role |
| `company` | First `work_experience[].company` (current) | |
| `location` | `location` | String |
| `followers` | `follower_count` | Default `0` |
| `connections` | `connections_count` | Default `0` |
| `profile_url` | `public_identifier` | `https://www.linkedin.com/in/{public_identifier}` |
| `profile_picture` | `profile_picture_url_large` → `profile_picture_url` | Prefer large |
| `background_picture` | `background_picture_url` | |
| `creator_mode` | `is_creator` | Default `false` |

## LinkedIn flags & metadata

| ALwrity field | Unipile source |
|---------------|----------------|
| `provider_id` | `provider_id` |
| `public_identifier` | `public_identifier` |
| `member_urn` | `member_urn` |
| `primary_locale` | `primary_locale` → `{ country, language }` |
| `is_open_profile` | `is_open_profile` |
| `is_premium` | `is_premium` |
| `is_influencer` | `is_influencer` |
| `is_self` | `is_self` — expect `true` for `/users/me` |
| `websites` | `websites[]` |
| `hashtags` | `hashtags[]` |

## Work experience

Map `work_experience[]` (use `work_experience_total_count` for logging only):

| ALwrity `experience[]` field | Unipile `work_experience[]` |
|------------------------------|-------------------------------|
| `title` | `position` |
| `company` | `company` |
| `company_id` | `company_id` |
| `company_picture_url` | `company_picture_url` |
| `start` | `start` |
| `end` | `end` (null = current) |
| `location` | `location` |
| `description` | `description` |
| `skills` | `skills[]` |

## Education

Map `education[]` (use `education_total_count` for logging):

| ALwrity `education[]` field | Unipile `education[]` |
|-----------------------------|------------------------|
| `school` | `school` |
| `school_id` | `school_id` |
| `school_picture_url` | `school_picture_url` |
| `degree` | `degree` |
| `start` | `start` |
| `end` | `end` |

## Skills, languages, certifications

| ALwrity field | Unipile source |
|---------------|----------------|
| `skills` | `skills[]` → `{ name, endorsement_count }` |
| `skills_total_count` | `skills_total_count` |
| `languages` | `languages[]` → `{ name, proficiency }` |
| `languages_total_count` | `languages_total_count` |
| `certifications` | `certifications[]` |
| `certifications_total_count` | `certifications_total_count` |

## Volunteering, projects, recommendations

| ALwrity field | Unipile source |
|---------------|----------------|
| `volunteering_experience` | `volunteering_experience[]` |
| `volunteering_experience_total_count` | `volunteering_experience_total_count` |
| `projects` | `projects[]` |
| `projects_total_count` | `projects_total_count` |
| `recommendations` | `recommendations` object |

Normalize `recommendations.given[]` / `received[]` entries:

| ALwrity field | Unipile source |
|---------------|----------------|
| `caption` | `caption` |
| `text` | `text` |
| `actor.first_name` | `actor.first_name` |
| `actor.last_name` | `actor.last_name` |
| `actor.headline` | `actor.headline` |
| `actor.public_profile_url` | `actor.public_profile_url` |
| `actor.profile_picture_url` | `actor.profile_picture_url` |

Store counts: `recommendations_given_count`, `recommendations_received_count` from `given_total_count` / `received_total_count`.

## Fields not on UserProfile

| ALwrity field | Phase 1 handling |
|---------------|------------------|
| `industry` | Omit or derive later in Phase 2 if needed — not a top-level Unipile field in UserProfile |

---

# Data to Collect

All data below comes from **one** `users/me` call. Phase 3 required fields are marked **(required)**.

## Personal (required for Phase 3)

- Name (`first_name`, `last_name`, `name`) **(required)**
- Headline **(required)**
- About / summary **(required)**
- Job title & company (from current `work_experience`) **(required)**
- Location

## Professional (required for Phase 3 — at least one of skills / experience / education)

- Skills (+ endorsement counts)
- Work experience (full history)
- Education (full history)
- Languages
- Certifications
- Volunteering experience
- Projects
- Recommendations (given & received)

## LinkedIn platform

- Followers, connections
- Creator mode (`is_creator`)
- Premium, influencer, open profile flags
- Profile URL, profile picture, background picture
- Websites, hashtags
- Primary locale

---

# Response Model

Normalized ALwrity profile — **not** raw Unipile JSON:

```json
{
  "first_name": "",
  "last_name": "",
  "name": "",
  "headline": "",
  "about": "",
  "job_title": "",
  "company": "",
  "location": "",
  "provider_id": "",
  "public_identifier": "",
  "member_urn": "",
  "primary_locale": { "country": "", "language": "" },
  "is_open_profile": false,
  "is_premium": false,
  "is_influencer": false,
  "creator_mode": false,
  "is_self": true,
  "websites": [],
  "hashtags": [],
  "followers": 0,
  "connections": 0,
  "profile_url": "",
  "profile_picture": "",
  "background_picture": "",
  "skills_total_count": 0,
  "skills": [{ "name": "", "endorsement_count": 0 }],
  "work_experience_total_count": 0,
  "experience": [
    {
      "title": "",
      "company": "",
      "company_id": "",
      "company_picture_url": "",
      "start": "",
      "end": null,
      "location": "",
      "description": "",
      "skills": []
    }
  ],
  "education_total_count": 0,
  "education": [
    {
      "school": "",
      "school_id": "",
      "school_picture_url": "",
      "degree": "",
      "start": "",
      "end": ""
    }
  ],
  "languages_total_count": 0,
  "languages": [{ "name": "", "proficiency": "" }],
  "certifications_total_count": 0,
  "certifications": [],
  "volunteering_experience_total_count": 0,
  "volunteering_experience": [],
  "projects_total_count": 0,
  "projects": [],
  "recommendations_given_count": 0,
  "recommendations_received_count": 0,
  "recommendations": {
    "given": [
      {
        "caption": "",
        "text": "",
        "actor": {
          "first_name": "",
          "last_name": "",
          "headline": "",
          "public_profile_url": "",
          "profile_picture_url": ""
        }
      }
    ],
    "received": []
  }
}
```

Do NOT include raw Unipile payloads in the API response.

---

# API Endpoint

```
GET /api/linkedin-social/profile
GET /api/linkedin-social/profile?refresh=true
```

| Query | Behavior |
|-------|----------|
| (default) | Return cached `normalized_profile_json` if present; fetch Unipile only on cache miss |
| `refresh=true` | Force Unipile fetch, update DB, invalidate downstream if hash changed |

Response (Phase 1):

```json
{
  "profile": { "...": "normalized profile" },
  "meta": {
    "source": "cache",
    "fetched_at": "2026-06-18T12:00:00Z",
    "profile_content_hash": "sha256..."
  }
}
```

- Authenticate user (Clerk)
- Verify `unipile_account_id` via `resolve_credentials`
- Call `profile_service.get_or_fetch_profile(user_id, refresh=...)`

Phase 2+ add `profile_context`, `profile_validation`, etc. to the **same** response, all loaded from DB (built on demand only if column empty and profile exists).

---

# CLI Testing Workflow (Do This Before Relying on HTTP)

Recommended order after implementing Steps 1.1–1.4:

| Step | Action | Expected |
|------|--------|----------|
| 1 | Connect LinkedIn in app (Unipile hosted OAuth) | `linkedin_oauth_tokens.unipile_account_id` populated |
| 2 | Run CLI with `--dry-run` | UserProfile JSON in logs; confirms Unipile works |
| 3 | Run CLI without flags | Profile saved to `linkedin_analysis_context` |
| 4 | Run CLI again (no `--refresh`) | Log shows `source=cache`; **no Unipile HTTP** |
| 5 | Run CLI with `--refresh` | New fetch; `fetched_at` updated |
| 6 | Inspect DB row | `normalized_profile_json` contains full sections |
| 7 | Enable HTTP endpoint (Step 1.6) | Same data as CLI; cache behavior matches |

Optional: export fixture for offline Phase 2 development:

```bash
python backend/scripts/linkedin_fetch_profile.py --user-id USER_ID --print-json > docs/linkedin/fixtures/sample_normalized_profile.json
```

Phase 2/3/5 developers can use this fixture **without** Unipile credentials during unit tests.

---

# Authentication

- `unipile_account_id` from `linkedin_oauth_tokens` (`provider_mode=unipile`)
- No `unipile_account_id` → `401` LinkedIn account not connected

---

# Logging Requirements

Prefix: `[LinkedInProfile]`

```
[LinkedInProfile] Calling Unipile GET /users/me linkedin_sections=*
[LinkedInProfile] UserProfile fetched is_self=... work_experience_total_count=... skills_total_count=...
[LinkedInProfile] Normalized name=... experience_count=... education_count=... recommendations_given=...
```

Log section totals (`*_total_count`) even when arrays are empty.

---

# Exception Handling

| Condition | HTTP | Detail |
|-----------|------|--------|
| Not connected | 401 | LinkedIn account not connected |
| Unipile disconnected account | 401 | Reconnect required |
| Unipile 403 / feature not subscribed | 502 | Unable to fetch LinkedIn profile |
| Timeout / network | 500 | Unable to fetch LinkedIn profile |
| Unexpected | 500 | Unable to fetch LinkedIn profile |

---

# Testing Checklist

## CLI — first acquire

- User connected via Unipile; valid `user_id`
- `python backend/scripts/linkedin_fetch_profile.py --user-id USER_ID` exits 0
- Log: `source=unipile`, section counts logged
- DB row created with `normalized_profile_json`, `fetched_at`, `profile_content_hash`

## CLI — cache hit (no second Unipile call)

- Run same command again without `--refresh`
- Log: `source=cache`
- No Unipile HTTP in backend logs

## CLI — forced refresh

- `--refresh` updates `fetched_at`
- If profile content changed, hash changes and downstream columns cleared

## HTTP — successful fetch

- `GET /api/linkedin-social/profile` returns 200
- `meta.source` is `cache` on repeat requests
- `profile.is_self` is `true`
- `?refresh=true` sets `meta.source` to `unipile`

## Sparse profile

Expected: 200, empty strings / arrays / zero counts — no exception.

## Disconnected user

Expected: `401`.

## Unipile account disconnected

Expected: `401` or `502`; see `UNIPILE_POST_CONNECT_UX_AND_DISCONNECT_PLAN.md`.

---

# Success Criteria

Phase 1 is complete when:

✅ CLI script acquires and persists profile for a connected Unipile user

✅ Repeat CLI/API requests serve from **cache** without Unipile calls

✅ `?refresh=true` / `--refresh` performs exactly **one** Unipile call and updates DB

✅ Normalized profile includes full UserProfile sections

✅ Phase 3 required fields available in stored `normalized_profile_json`

✅ `profile_content_hash` + `invalidate_downstream()` ready for Phase 2/5 invalidation

✅ `linkedin_analysis_context` table exists with columns reserved for later phases

✅ No raw Unipile payload exposed via API or CLI default output

✅ Loguru logging + exception handling

✅ `profile_service.py` + `profile_repository.py` reusable for Phase 2+

---

# Future Phases (Storage Ownership)

| Phase | Reads from DB | Writes to DB | External API |
|-------|---------------|--------------|--------------|
| **Phase 1** (this) | — | `normalized_profile_json`, hash, `fetched_at` | Unipile (acquire/refresh only) |
| **Phase 2** | `normalized_profile_json` | `profile_context_json` | None |
| **Phase 3** | `profile_context_json` | `profile_validation_json` | None |
| **Phase 4** | `profile_context_json`, validation | `user_completion_json` | None |
| **Phase 5** | `profile_context_json` (+ completion) | `ai_profile_intelligence_json` | LLM only (no Unipile) |
| **Phase 6** | `ai_profile_intelligence_json` | recommendations cache (optional) | LLM; optional Unipile posts later |

**Future Unipile enrichment (not Phase 1):** list posts, comments, reactions, relations — separate from UserProfile snapshot.

---

# References

- `docs/linkedin/UNIPILE_LINKEDIN_ANALYSIS_GOALS_AND_API_MAPPING.md`
- Phase 2 / 3 / 5 docs in `docs/linkedin/linkedin-analysis-context/`
- [Unipile — Retrieving users](https://developer.unipile.com/docs/retrieving-users)
- [Unipile API Reference — Users](https://developer.unipile.com/reference/posts)
- Code: `unipile_client.py`, `unipile_provider.py`, `linkedin_oauth.py`
- New (Phase 1): `profile_service.py`, `profile_repository.py`, `scripts/linkedin_fetch_profile.py`
