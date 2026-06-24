# ALwrity LinkedIn Analysis Goals & Unipile API Capability Map

## Document Information

**Date:** 2026-06-18  
**Status:** Architecture & Planning (No Code Changes)  
**Audience:** Engineering, product, and future implementers  
**Sources:**
- `docs/linkedin/linkedin-analysis-context/` (Phases 1–6)
- `docs/linkedin/unipile/` (connection migration, UI fix plans, RCAs)
- [Unipile API Reference](https://developer.unipile.com/reference/posts) (Accounts, Users, Posts, LinkedIn-specific)
- [Unipile — Retrieving Users](https://developer.unipile.com/docs/retrieving-users)
- [Unipile — Hosted Auth](https://developer.unipile.com/docs/hosted-auth)

---

## 1. Executive Summary

ALwrity’s LinkedIn Writer has **two converging tracks**:

| Track | Goal | Status (2026-06-18) |
|-------|------|---------------------|
| **A. Provider migration** | Replace Zernio with Unipile for LinkedIn account connection (hosted OAuth) | **Largely complete** — connect, callback, profile card UI, avatar fetch via Users API |
| **B. LinkedIn AI Brain** | Six-phase pipeline to understand the user’s professional identity and recommend personalized content | **Not started** — plans live in `linkedin-analysis-context/` |

The **north-star outcome** (Phase 6 end state):

1. User connects LinkedIn.
2. ALwrity builds a standardized **Profile Context** from live LinkedIn data.
3. ALwrity validates completeness and collects only missing fields.
4. ALwrity generates **AI Profile Intelligence** (“who is this professional?”).
5. ALwrity returns **five personalized content recommendations** (not full posts).

Unipile is the **data and connection layer** for track A and **Phase 1 data acquisition** for track B. Phases 2–6 remain ALwrity-owned logic (normalization, validation, LLM, UI). Unipile does **not** replace ALwrity’s AI; it replaces Zernio as the LinkedIn API gateway.

---

## 2. Understanding Your Goal — The Six-Phase Pipeline

The `linkedin-analysis-context` folder defines a **strict, modular pipeline**. Each phase has a single responsibility; later phases never read raw provider payloads.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Phase 1 – Acquire Data                                                 │
│  Fetch & normalize LinkedIn profile from connected account              │
│  Output: normalized `profile` on GET /api/linkedin-social/profile       │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Phase 2 – Normalize Data (Profile Context Builder)                     │
│  NO AI — clean nulls, standardize field names                           │
│  Output: `profile_context` (LinkedInProfileContext)                     │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Phase 3 – Validate Data (Profile Completeness Validator)               │
│  NO AI — required vs optional fields, completeness %                    │
│  Output: `profile_validation`                                             │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Phase 4 – Complete Data (Adaptive Profile Completion)                    │
│  NO AI — ask only for missing fields (max 5 questions)                    │
│  Output: updated context + re-validation                                  │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Phase 5 – Understand Data (AI Profile Intelligence Engine)             │
│  FIRST AI PHASE — structured JSON from Profile Context only             │
│  Output: `ai_profile_intelligence`                                      │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Phase 6 – Personalized Content Recommendation Engine                   │
│  AI — exactly 5 topic recommendations from AI Profile Intelligence only   │
│  Output: `recommendations[]`                                            │
└─────────────────────────────────────────────────────────────────────────┘
```

### Design principles (from your plans)

- **One endpoint grows over time:** `GET /api/linkedin-social/profile` accumulates `profile`, `profile_context`, `profile_validation`, `ai_profile_intelligence`, `recommendations` — avoid endpoint sprawl where possible.
- **Provider abstraction:** Phase 1 originally referenced Zernio; with Unipile live, Phase 1 must fetch via `UnipileProvider` / `UnipileClient`, not Zernio-only APIs.
- **No AI before Phase 5:** Phases 1–4 are deterministic data engineering.
- **No content generation in Phase 6:** Recommendations only; posts/articles come from existing LinkedIn Writer generation services later.

### Target Profile Context shape (Phase 2)

| Section | Fields |
|---------|--------|
| `personal_information` | name, headline, about, location |
| `professional_information` | job_title, company, industry, skills[], experience[], education[] |
| `linkedin_information` | followers, connections, creator_mode, profile_url, profile_picture |

### Required fields for “complete” profile (Phase 3)

**Mandatory:** name, headline, job_title, company, about, and **at least one of** skills / experience / education.  
**Optional (never block):** location, followers, connections, creator_mode, profile_picture, profile_url.

---

## 3. What Is Already Built (Unipile Connection Track)

These items are **done or partially done** and form the foundation for Phase 1:

| Capability | Implementation | Notes |
|------------|----------------|-------|
| Hosted OAuth connect | `UnipileClient.create_hosted_auth_link()` | `type: create`, `name=user_id`, redirect + webhook URLs |
| Callback + credential storage | `LinkedInOAuthService.handle_unipile_callback()` | Stores `unipile_account_id`, `account_name` |
| Connection status | `GET /api/linkedin-social/connection/status` | Provider-aware |
| Account list + avatar | `UnipileProvider.list_accounts()`, `get_own_profile()` | Users API for photo when Account object lacks it |
| Connected UI (Unipile) | `LinkedInConnectedProfileCard` | Zernio still shows analytics dashboard |
| Auto-sync orphaned accounts | `try_sync_unipile_accounts()` | Recovery when callback URL fails |

**Not yet built for analysis pipeline:**

- `GET /api/linkedin-social/profile` (Phase 1 endpoint)
- `profile_service.py`, `profile_context_builder.py`, etc.
- Full profile sections (experience, skills, education) from Unipile
- Unipile analytics equivalents (aggregate metrics Zernio exposed)
- Publishing via Unipile (`create_post` stubs raise `NotImplementedError`)

---

## 4. Unipile API — Capability Overview

Unipile exposes a **REST API** scoped by `account_id` (the connected LinkedIn account). All LinkedIn calls require:

- Header: `X-API-KEY: {UNIPILE_API_KEY}`
- Base URL: `https://{UNIPILE_DSN}` (e.g. `api30.unipile.com:16037`)
- Query/body: `account_id` for most LinkedIn operations

### 4.1 Accounts (connection lifecycle)

| API | Method | Purpose for ALwrity |
|-----|--------|---------------------|
| List all accounts | `GET /api/v1/accounts` | Sync, match user by hosted-auth `name` |
| Retrieve an account | `GET /api/v1/accounts/{id}` | Status, metadata, identifiers |
| Connect (hosted auth) | `POST /api/v1/hosted/accounts/link` | Initial connect (`type: create`) |
| Reconnect (hosted auth) | `POST /api/v1/hosted/accounts/link` | Reconnect (`type: reconnect`, `reconnect_account`) |
| Delete an account | `DELETE /api/v1/accounts/{id}` | **Currently called on ALwrity disconnect** — see `UNIPILE_POST_CONNECT_UX_AND_DISCONNECT_PLAN.md` |
| Reconnect account (native) | `POST /api/v1/accounts/.../reconnect` | Alternative to hosted reconnect |

**Relevance:** Connection track ✅. Phase 1 needs a **healthy, running** account (`status: OK`).

### 4.2 Users (profile & network — **core for Phase 1**)

| API | Method | Purpose for ALwrity |
|-----|--------|---------------------|
| **Retrieve own profile** | `GET /api/v1/users/me?account_id={id}` | **Primary Phase 1 source** — name, headline, photos, counts |
| Retrieve a profile | `GET /api/v1/users/{identifier}?account_id={id}` | Other members; optional for competitor/network features |
| Edit own profile | `PATCH` (Users) | Future: push user answers from Phase 4 back to LinkedIn (optional) |
| **List all relations** | `GET` (Users — relations) | Network size, connection graph (Phase 1 optional: `connections`) |
| **List all followers** | `GET` (Users — followers) | Audience size signals |
| List invitations sent/received | `GET` | Out of analysis MVP scope |
| Send invitation | `POST` | Out of scope |

**Profile sections (LinkedIn Classic):**  
When fetching a profile, Unipile supports section parameters (e.g. `linkedin_sections=*` or v2 `with_sections`) to retrieve experience, skills, education, about, etc. See [Retrieving users](https://developer.unipile.com/docs/retrieving-users).

**Key response fields for ALwrity normalization:**

| Unipile field | Maps to Phase 1 / Context |
|---------------|---------------------------|
| `first_name`, `last_name` | `name` |
| `headline` | `headline` |
| `summary` / bio fields | `about` |
| `location` | `location` |
| `profile_picture_url`, `profile_picture_url_large` | `profile_picture` |
| `public_identifier` | `profile_url` (construct `linkedin.com/in/{id}`) |
| `follower_count` / `followers_count` | `followers` |
| `connections_count` / `relations_count` | `connections` |
| `work_experience` | `experience[]` |
| `education` | `education[]` |
| `skills` | `skills[]` |
| `provider_id` | Internal LinkedIn id (store if needed) |

### 4.3 Posts, comments, reactions (engagement signals — **Phase 6+ enrichment**)

| API | Method | Purpose for ALwrity |
|-----|--------|---------------------|
| **List all posts** | `GET` (Users — posts) | Recent content themes, posting frequency |
| **List all comments** | `GET` (Users — comments) | Engagement patterns |
| **List all reactions** | `GET` (Users — reactions) | What content resonates |
| Retrieve a post | `GET /api/v1/posts/{id}` | Single-post detail |
| Create a post | `POST /api/v1/posts` | **Future publishing** (Phase 4 migration) |
| Comment a post | `POST` | Future |
| Add reaction | `POST` | Future |

**Relevance:** Not required for Phases 1–5. Optional **Phase 6 enhancement** — weight recommendations by what the user actually posts/reacts to. **Not a substitute** for Zernio-style aggregate analytics dashboards.

### 4.4 LinkedIn-specific

| API | Purpose |
|-----|---------|
| Perform LinkedIn search | People/company discovery — future competitor/growth features |
| Retrieve company profile | Org pages — future org publishing |
| Get raw data from any endpoint | Escape hatch for unsupported LinkedIn web API paths |
| Job postings / Recruiter | Out of LinkedIn Writer MVP scope |

---

## 5. Phase-by-Phase Mapping: Your Plan → Unipile → ALwrity Code

### Phase 1 – Acquire Data

**Your goal:** Fetch every available profile field; normalize; expose via `GET /api/linkedin-social/profile`. No AI.

| Item | Detail |
|------|--------|
| **Unipile APIs** | `GET /api/v1/users/me?account_id={unipile_account_id}` with full LinkedIn sections; fallback `GET /api/v1/accounts/{id}` for status/identifiers |
| **Extend existing code** | `UnipileClient.get_own_profile()` — add `linkedin_sections` / `with_sections` query param; new `profile_service.py` calling provider, not Zernio |
| **Provider switch** | `get_linkedin_provider()` — when `LINKEDIN_PROVIDER=unipile`, Phase 1 uses Unipile; Zernio path unchanged for legacy users |
| **Normalized output** | Flat `profile` object per Phase 1 spec (name, headline, about, skills, experience, education, followers, connections, creator_mode, profile_url, profile_picture) |
| **Do not duplicate** | Reuse `unipile_display_name_from_item`, `avatar_url_from_user_profile`, credential resolution in `LinkedInOAuthService` |

**Gap vs original plan:** Phase 1 doc says “fetch from Zernio.” Implementation should treat **Unipile Users API as the Zernio equivalent** for profile richness.

### Phase 2 – Normalize Data

**Your goal:** Build `LinkedInProfileContext` from normalized profile. No AI. No new Unipile calls.

| Item | Detail |
|------|--------|
| **Unipile APIs** | None ( consumes Phase 1 output only ) |
| **New ALwrity service** | `profile_context_builder.py` → `build_profile_context()` |
| **API extension** | Add `profile_context` to `/profile` response |

### Phase 3 – Validate Data

**Your goal:** Completeness score + missing field lists. No AI.

| Item | Detail |
|------|--------|
| **Unipile APIs** | None |
| **New ALwrity service** | `profile_validator.py` |
| **API extension** | Add `profile_validation` to `/profile` response |

### Phase 4 – Complete Data

**Your goal:** Predefined questions for missing fields only; update context; re-validate.

| Item | Detail |
|------|--------|
| **Unipile APIs** | Optional later: `Edit own profile` to write answers to LinkedIn — **not required for MVP** |
| **New ALwrity pieces** | `profile_completion_service.py`, `POST /api/linkedin-social/profile/complete`, `ProfileCompletionForm.tsx` |
| **Rule** | Never overwrite fields already present from LinkedIn |

### Phase 5 – Understand Data (AI)

**Your goal:** LLM → structured `ai_profile_intelligence` JSON from Profile Context only.

| Item | Detail |
|------|--------|
| **Unipile APIs** | None at request time (data already acquired in Phase 1) |
| **ALwrity** | `profile_intelligence_service.py`, prompt in `backend/prompts/linkedin/`, reuse existing Gemini/LLM gateway |
| **Storage** | Persist intelligence keyed by user + profile hash to avoid redundant LLM calls |

### Phase 6 – Personalized Content Recommendations (AI)

**Your goal:** Exactly 5 recommendations from `AIProfileIntelligence` only.

| Item | Detail |
|------|--------|
| **Unipile APIs** | Optional enrichment: `List all posts`, `List all reactions` to tune “growth_impact” — **not in original Phase 6 spec** |
| **ALwrity** | `topic_recommendation_service.py`, `ContentRecommendations.tsx` |
| **Formats allowed** | LinkedIn Post, LinkedIn Article only (per plan) |

---

## 6. Unipile vs Zernio — What Changes for the Analysis Pipeline

| Concern | Zernio (legacy) | Unipile (target) |
|---------|-----------------|------------------|
| Connection | Zernio connect URL + tempToken callback | Hosted Auth Wizard |
| Profile fetch | Zernio account/profile APIs | **Users API** (`/users/me` + sections) |
| Personal analytics dashboard | Zernio aggregate analytics | **Not available 1:1** — use Posts/Reactions/Relations or defer dashboard |
| Publishing | Zernio publish endpoints | Unipile **Create a post** (future) |
| Org / company pages | Zernio org accounts | Unipile company profile + org connection (future) |

**Implication:** The LinkedIn Writer **analytics dashboard** (Zernio) and the **AI Brain pipeline** (Phases 1–6) are **different products**. Unipile-connected users currently see the **profile card**, not analytics — which aligns with building the analysis pipeline next instead of porting Zernio analytics immediately.

---

## 7. Recommended Implementation Order

Aligns your six-phase plan with completed Unipile connection work:

```
DONE  ─ Unipile connection + profile card + avatar (Users/me)
        │
        ▼
NEXT  ─ Phase C (disconnect/reconnect) from UNIPILE_POST_CONNECT_UX_AND_DISCONNECT_PLAN.md
        │   Local-only disconnect; reconnect vs create — stable account for API calls
        ▼
      ─ Phase 1 (Acquire) — profile_service + GET /profile via Unipile users/me + sections
        ▼
      ─ Phase 2 → 3 → 4 (deterministic pipeline)
        ▼
      ─ Phase 5 → 6 (AI intelligence + recommendations)
        ▼
LATER ─ Unipile publishing (Create post)
      ─ Unipile “analytics-like” dashboard from posts/reactions (optional)
      ─ Org pages, search, relations-based growth features
```

---

## 8. Unipile API Quick Reference (ALwrity-relevant)

Base: `https://{UNIPILE_DSN}/api/v1/...`

| Goal | Endpoint pattern | Required params |
|------|------------------|-----------------|
| Own profile (Phase 1) | `GET /users/me` | `account_id`, optional `linkedin_sections` |
| Profile photo | Same as above | `profile_picture_url`, `profile_picture_url_large` |
| Account status | `GET /accounts/{id}` | — |
| List connected accounts | `GET /accounts?provider=LINKEDIN` | — |
| Hosted connect | `POST /hosted/accounts/link` | `type`, `api_url`, `expiresOn`, redirect URLs, `name` |
| Hosted reconnect | `POST /hosted/accounts/link` | `type: reconnect`, `reconnect_account` |
| User’s posts | Users → List all posts | `account_id` |
| User’s reactions | Users → List all reactions | `account_id` |
| User’s comments | Users → List all comments | `account_id` |
| Network relations | Users → List all relations | `account_id` |
| Followers | Users → List all followers | `account_id` |
| Publish post (future) | `POST /posts` | `account_id`, content payload |

Official docs: [Unipile API Reference](https://developer.unipile.com/reference/posts), [Retrieving users](https://developer.unipile.com/docs/retrieving-users), [Hosted auth](https://developer.unipile.com/docs/hosted-auth).

---

## 9. Risks, Limits & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| LinkedIn rate limits on profile section fetches | Phase 1 incomplete or slow | Request only needed sections; cache normalized profile; use `_preview` section mode per Unipile docs |
| `users/me` vs Account object field mismatch | Missing avatar/name (seen in production) | Already mitigated via `_resolve_avatar_url()` chain; extend to full profile fetch |
| Disconnect deletes Unipile account | Reconnect failures, provider rate errors | Phase C plan: local-only disconnect by default |
| No Zernio-style aggregate analytics | Dashboard empty for Unipile users | Expected — build AI Brain UI instead; optional posts/reactions summary later |
| Duplicate Unipile accounts on dashboard | Auth / sync confusion | Manual cleanup + match by `name=user_id` + reconnect flow |
| LLM hallucination in Phases 5–6 | Bad recommendations | Strict JSON validation; “Unknown” for missing data; Profile Context as sole input |

---

## 10. Success Criteria (End-to-End)

When both tracks converge, a Unipile-connected user should experience:

1. **Connect** — Hosted auth, credentials stored, profile card with photo and name.
2. **Profile API** — `GET /api/linkedin-social/profile` returns profile → context → validation (and completion if needed).
3. **Intelligence** — `ai_profile_intelligence` describes professional identity without inventing facts.
4. **Recommendations** — Five personalized ideas with format, audience, and growth impact.
5. **Writer integration** — Future: “Generate” from a recommendation uses existing `/api/linkedin/generate-*` services fed by intelligence, not raw LinkedIn API.

---

## 11. Related Documentation Index

| Document | Purpose |
|----------|---------|
| `linkedin-analysis-context/Phase 1 – Acquire Data.md` | Phase 1 spec (update provider: Unipile not Zernio) |
| `linkedin-analysis-context/Phase 2 → Normalize Data.md` | Profile Context Builder |
| `linkedin-analysis-context/Phase 3 → Validate Data.md` | Completeness validator |
| `linkedin-analysis-context/Phase 4 → Complete Data.md` | Adaptive questions |
| `linkedin-analysis-context/Phase 5 → Understand Data.md` | AI Profile Intelligence |
| `linkedin-analysis-context/Phase 6 - Personalized Content Recommendation Engine.md` | Five recommendations |
| `unipile/MIGRATION_PLAN_LINKEDIN_CONNECTION_ONLY.md` | Connection scope |
| `unipile/MIGRATION_PLAN_ZERNIO_TO_UNIPILE.md` | Full migration (analytics, publish) |
| `unipile/UNIPILE_CONNECTION_AND_PROFILE_UI_FIX_PLAN.md` | OAuth + UI phases (1–3 done) |
| `unipile/UNIPILE_POST_CONNECT_UX_AND_DISCONNECT_PLAN.md` | Subtitle, avatar, disconnect (A done, B partial, C pending) |

---

## 12. Summary Statement

**Your goal** is to build ALwrity’s **LinkedIn AI Brain**: acquire real profile data, normalize it into an internal language, validate and complete it, then use ALwrity’s LLM stack to understand the professional and recommend five high-fit content ideas — without generating posts in that pipeline.

**Unipile’s role** is to **connect** the LinkedIn account and **supply profile and social graph data** through the Users API (and optionally Posts/Reactions/Relations for later intelligence). It replaces Zernio for connection and Phase 1 acquisition; it does **not** replace Phases 2–6 logic or ALwrity’s content generators.

**Next engineering focus** after stabilizing disconnect/reconnect: implement **Phase 1 Acquire Data** using `GET /api/v1/users/me` with full LinkedIn sections, wired through the existing `UnipileClient` / `LinkedInSocialProvider` factory — without breaking the Zernio path for users still on `LINKEDIN_PROVIDER=zernio`.
