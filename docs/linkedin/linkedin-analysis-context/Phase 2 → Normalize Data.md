# ALwrity LinkedIn Writer
# Phase 2 – Normalize Data

**Updated:** 2026-06-19 (planning review — implementation-ready after revisions below)  
**Prerequisites:** Phase 1 complete (`profile_service.py`, `profile_repository.py`, `GET /api/linkedin-social/profile`)  
**Related:** Phase 1 doc §Future Phases (Storage Ownership); Phase 3–6 consume `LinkedInProfileContext`

---

# Planning Review Summary

The original Phase 2 design is **directionally correct** but required refinements before implementation:

| Area | Original doc | Required change |
|------|--------------|-----------------|
| Module path | `backend/services/linkedin/` | Use `backend/services/integrations/linkedin/` (matches Phase 1) |
| Input source | Ambiguous “normalized profile” | **Only** Phase 1 `normalized_profile_json` / `get_or_fetch_profile()` output — never Unipile |
| Field standardization examples (`bio→about`, etc.) | Implied Unipile aliasing | **Remove** — Phase 1 `normalize_unipile_profile()` already maps Unipile → ALwrity flat profile |
| `LinkedInProfileContext` model | Minimal 3-section example | **Expand** to carry all Phase 1 sections Phase 3–5 need (languages, certifications, etc.) |
| DB persistence | Not specified | **Add** — write/read `profile_context_json` + `profile_context_updated_at` (column already exists) |
| Cache orchestration | Not specified | **Add** — `get_or_build_profile_context()` mirroring Phase 1 cache-first pattern |
| Exception handling | `HTTPException` inside builder | **Fix** — builder raises domain errors; routes map to HTTP (ALwrity modular rule) |
| Coercion utilities | Re-implement cleaning rules | **Reuse** Phase 1 coercers (`_clean_str`, `_coerce_int`, etc.) — extract to shared module if import from `profile_service` is awkward |
| Logging prefix | `[Profile Context Builder]` | Use `[LinkedInProfileContext]` (consistent with Phase 1 `[LinkedInProfile]`) |
| CLI testing | Not specified | Extend `linkedin_fetch_profile.py` with context gate (Step 2.6) |

After these revisions, this document is **implementation-ready**.

---

# Objective

Build the **Profile Context Builder**.

Convert the Phase 1 normalized LinkedIn profile into a structured **`LinkedInProfileContext`** — ALwrity's canonical professional profile object for Phases 3–6.

This phase contains **NO AI**, **NO validation**, **NO topic generation**, **NO Unipile calls**.

```
Unipile (Phase 1 only)
  ↓
Normalized Profile (flat ALwrity dict — Phase 1)
  ↓
Profile Context (grouped ALwrity dict — Phase 2)   ← single source of truth for later phases
  ↓
Future: Validation → Completion → AI Intelligence → Recommendations
```

---

# Prerequisites

Phase 1 must be complete:

| Asset | Location |
|-------|----------|
| Normalized profile orchestrator | `get_or_fetch_profile()` in `profile_service.py` |
| Persistence | `ProfileRepository` + `linkedin_analysis_context` table |
| HTTP endpoint | `GET /api/linkedin-social/profile` |
| Reserved DB columns | `profile_context_json`, `profile_context_updated_at` |
| Downstream invalidation | `invalidate_downstream()` on `profile_content_hash` change |

Do **not** duplicate Phase 1 acquire, normalize, or Unipile integration.

---

# Scope

## In Scope

- Read Phase 1 normalized profile (from memory or DB)
- Build `LinkedInProfileContext` (grouped, AI-ready structure)
- Defensive re-cleaning at nested levels (idempotent — safe if Phase 1 already cleaned)
- Persist `profile_context_json` to SQLite
- Cache-first rebuild only when column is NULL or invalidated
- Extend `GET /api/linkedin-social/profile` response with `profile_context`
- Loguru logging + exception handling
- CLI gate for offline testing

## Out of Scope

Do **not** implement:

- AI summary / intelligence (Phase 5)
- Profile completeness validation (Phase 3)
- Dynamic questions / user completion (Phase 4)
- Topic or content recommendations (Phase 6)
- Unipile HTTP calls
- Raw Unipile JSON exposure

---

# Phase Boundary — Phase 1 vs Phase 2

| Concern | Phase 1 | Phase 2 |
|---------|---------|---------|
| Unipile fetch | ✅ | ❌ |
| Unipile → flat ALwrity mapping | ✅ `normalize_unipile_profile()` | ❌ |
| Flat profile persistence | ✅ `normalized_profile_json` | ❌ |
| Flat → grouped reshape | ❌ | ✅ `build_profile_context()` |
| Semantic grouping for AI | ❌ | ✅ |
| `industry` placeholder (empty until Phase 4) | ❌ | ✅ |
| Profile context persistence | ❌ | ✅ `profile_context_json` |
| Validation / completeness | ❌ | ❌ |

Phase 2 **reshapes and re-validates types** on an already-normalized dict. It does **not** re-map Unipile field names.

---

# Backend Architecture

All new code lives under the existing LinkedIn integration module:

```
backend/services/integrations/linkedin/
├── profile_service.py              # Phase 1 — DO NOT add context logic here
├── profile_repository.py           # EXTEND — get/save profile_context
├── profile_context_builder.py      # NEW — pure transform only
├── profile_context_service.py      # NEW — cache-first orchestration
└── types.py                        # EXTEND — TypedDict / constants for context shape
```

### Responsibility separation

| Layer | Responsibility |
|-------|----------------|
| `profile_context_builder.py` | `build_profile_context(normalized: dict) → dict` — pure function, no DB, no HTTP |
| `profile_context_service.py` | `get_or_build_profile_context(user_id, normalized, hash, row?)` — cache read/build/persist |
| `profile_repository.py` | `get_profile_context()`, `save_profile_context()` — SQLite only |
| `linkedin_social_routes.py` | Call acquire + context orchestration; map exceptions to HTTP |
| `linkedin_social_models.py` | Extend response model (backward compatible) |

**Never** raise `HTTPException` from builder or repository layers.

---

# Implementation Steps

Follow Phase 1's incremental gate pattern.

## Step 2.1 — Context types and field contract

**Build:**

- `LinkedInProfileContext` TypedDict (or Pydantic model for API docs) in `types.py` or `linkedin_social_models.py`
- `PROFILE_CONTEXT_KEYS` frozenset for gate validation (mirror Phase 1 `NORMALIZED_PROFILE_KEYS` pattern)
- Field mapping table (see §Field Mapping below)

**Gate:** Unit test asserts full fixture produces object matching `PROFILE_CONTEXT_KEYS`.

---

## Step 2.2 — Profile context builder (pure transform)

**Build:** `profile_context_builder.py`

```python
def build_profile_context(normalized_profile: dict[str, Any]) -> dict[str, Any]:
    """Map Phase 1 flat normalized profile → LinkedInProfileContext."""
```

Rules:

- Input must be Phase 1 normalized shape (not raw Unipile)
- Missing top-level keys → defaults (`""`, `[]`, `0`, `False`) — **never raise** on missing optional fields
- Re-apply coercion at nested list items (experience rows, skill objects) defensively
- Log section counts at INFO (experience, skills, education lengths)
- Prefix: `[LinkedInProfileContext]`

**Gate:** Offline fixture test — complete profile, partial profile, invalid types (string followers), null values — all return complete context object, zero exceptions.

**Do not build:** repository, HTTP, or CLI yet.

---

## Step 2.3 — Repository integration

**Extend:** `profile_repository.py`

| Method | Purpose |
|--------|---------|
| `get_profile_context(user_id, *, row=None)` | Parse `profile_context_json`; return `None` if absent/invalid |
| `save_profile_context(user_id, context, *, content_hash=None)` | Upsert JSON + set `profile_context_updated_at` |

Notes:

- `invalidate_downstream()` already NULLs `profile_context_json` on hash change — no change needed
- `save_profile_context` does **not** touch `normalized_profile_json`
- JSON serialization: same pattern as `save_normalized_profile` (`separators=(",", ":")`, `default=str`)

**Gate:** After builder runs, row has non-null `profile_context_json` and timestamp.

---

## Step 2.4 — Context service orchestration

**Build:** `profile_context_service.py`

```python
def get_or_build_profile_context(
    user_id: str,
    normalized_profile: dict[str, Any],
    *,
    profile_content_hash: str | None,
    repository: ProfileRepository | None = None,
    force_rebuild: bool = False,
) -> tuple[dict[str, Any], ProfileContextMeta]:
```

Behavior:

1. If `force_rebuild` is False, read cached context from DB when `profile_context_json` is present and hash matches stored row's `profile_content_hash`
2. On cache miss → `build_profile_context(normalized_profile)` → `save_profile_context()`
3. Return `(context, meta)` where `meta.source` is `"cache"` or `"built"`

**Important:** Phase 2 orchestration is invoked **after** Phase 1 acquire in the HTTP/CLI path. It never calls Unipile.

**Gate:** Second call with same hash returns `meta.source = "cache"` without calling builder (log-verifiable).

---

## Step 2.5 — HTTP endpoint extension

**Extend:** `GET /api/linkedin-social/profile` in `linkedin_social_routes.py`

Flow:

```
get_or_fetch_profile(user_id, refresh=...)
  ↓
get_or_build_profile_context(user_id, profile, profile_content_hash=meta.profile_content_hash)
  ↓
return { profile, meta, profile_context, profile_context_meta }
```

Response (backward compatible — new fields are additive):

```json
{
  "profile": { "...": "Phase 1 flat normalized profile (unchanged)" },
  "meta": {
    "source": "cache",
    "fetched_at": "2026-06-18T12:00:00Z",
    "profile_content_hash": "sha256..."
  },
  "profile_context": { "...": "LinkedInProfileContext" },
  "profile_context_meta": {
    "source": "cache",
    "profile_context_updated_at": "2026-06-18T12:01:00Z"
  }
}
```

Backward compatibility:

- Existing clients reading only `profile` + `meta` continue to work
- `LinkedInProfileAcquireResponse` renamed or extended — prefer **extend** with optional new fields defaulting via orchestration (always populated when profile exists)
- `?refresh=true` still only affects Phase 1 Unipile fetch; hash change triggers downstream invalidation → context rebuilds on next request

Error mapping (route layer only):

| Condition | HTTP | Detail |
|-----------|------|--------|
| Context build unexpected failure | 500 | Unable to build LinkedIn profile context |
| Phase 1 errors | unchanged | (401/502/500 per Phase 1) |

**Gate:** Swagger shows new fields; repeat requests show `profile_context_meta.source: "cache"`.

---

## Step 2.6 — CLI gate

**Extend:** `backend/scripts/linkedin_fetch_profile.py`

```bash
python backend/scripts/linkedin_fetch_profile.py --user-id USER_ID --print-context
python backend/scripts/linkedin_fetch_profile.py --from-fixture PATH --print-context
```

Print context summary (section counts) + optional JSON stdout.

**Gate:** CLI `--print-context` matches HTTP `profile_context` for same user.

---

## Step 2.7 — Coercion utility reuse (if needed)

Phase 1 already defines `_clean_str`, `_coerce_bool`, `_coerce_int`, `_coerce_list` in `profile_service.py`.

**Preferred:** Extract to `backend/services/integrations/linkedin/field_coercion.py` and import from both Phase 1 normalizer and Phase 2 builder (minimal diff to Phase 1 — re-export from profile_service for backward compat).

**Avoid:** Copy-pasting coercion logic into the builder.

---

# LinkedInProfileContext Model

Grouped structure optimized for Phase 3 validation paths and Phase 5 LLM input.  
All string fields default to `""`; lists to `[]`; counts to `0`; booleans to `False`.

```python
LinkedInProfileContext = {
    "personal_information": {
        "first_name": "",
        "last_name": "",
        "name": "",
        "headline": "",
        "about": "",
        "location": "",
    },
    "professional_information": {
        "job_title": "",
        "company": "",
        "industry": "",          # empty from LinkedIn; Phase 4 may fill via user answers
        "skills": [],            # [{ "name": "", "endorsement_count": 0 }]
        "skills_total_count": 0,
        "experience": [],        # Phase 1 experience[] shape preserved
        "experience_total_count": 0,
        "education": [],         # Phase 1 education[] shape preserved
        "education_total_count": 0,
        "languages": [],         # [{ "name": "", "proficiency": "" }]
        "languages_total_count": 0,
        "certifications": [],
        "certifications_total_count": 0,
        "projects": [],
        "projects_total_count": 0,
        "volunteering_experience": [],
        "volunteering_experience_total_count": 0,
        "recommendations": {
            "given": [],
            "received": [],
        },
        "recommendations_given_count": 0,
        "recommendations_received_count": 0,
    },
    "linkedin_information": {
        "followers": 0,
        "connections": 0,
        "creator_mode": False,
        "is_premium": False,
        "is_influencer": False,
        "is_open_profile": False,
        "is_self": True,
        "profile_url": "",
        "profile_picture": "",
        "background_picture": "",
        "websites": [],
        "hashtags": [],
        "primary_locale": { "country": "", "language": "" },
        "public_identifier": "",
        "provider_id": "",
        "member_urn": "",
    },
    "meta": {
        "built_from_profile_content_hash": "",  # ties context to Phase 1 snapshot
        "schema_version": 1,                    # bump when shape changes
    },
}
```

### Rationale for additions vs original doc

| Addition | Why |
|----------|-----|
| `first_name`, `last_name` | Phase 5 identity; UI display |
| `industry` | Phase 4 question mapping; Phase 5 AI output cross-check |
| Full experience/education/skills shapes | Phase 5 expertise inference |
| languages, certifications, projects, volunteering, recommendations | Phase 1 already acquires; Phase 5 knowledge domains |
| Platform flags (`is_premium`, etc.) | Phase 5 audience/positioning signals |
| `websites`, `hashtags`, `primary_locale` | Creator context for later content features |
| `*_total_count` fields | Logging, UI completeness hints (Phase 3 uses presence not counts) |
| `meta.built_from_profile_content_hash` | Detect stale context without re-fetching Unipile |
| `meta.schema_version` | Safe evolution across phases |

### Nested item shapes (preserve Phase 1)

**experience[]:**

```json
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
```

**education[]:**

```json
{
  "school": "",
  "school_id": "",
  "school_picture_url": "",
  "degree": "",
  "start": "",
  "end": ""
}
```

**skills[]:**

```json
{ "name": "", "endorsement_count": 0 }
```

---

# Field Mapping — Phase 1 Normalized → Profile Context

| Profile Context path | Phase 1 normalized key |
|----------------------|------------------------|
| `personal_information.first_name` | `first_name` |
| `personal_information.last_name` | `last_name` |
| `personal_information.name` | `name` |
| `personal_information.headline` | `headline` |
| `personal_information.about` | `about` |
| `personal_information.location` | `location` |
| `professional_information.job_title` | `job_title` |
| `professional_information.company` | `company` |
| `professional_information.industry` | *(default `""` — not in Unipile UserProfile)* |
| `professional_information.skills` | `skills` |
| `professional_information.skills_total_count` | `skills_total_count` |
| `professional_information.experience` | `experience` |
| `professional_information.experience_total_count` | `work_experience_total_count` |
| `professional_information.education` | `education` |
| `professional_information.education_total_count` | `education_total_count` |
| `professional_information.languages` | `languages` |
| `professional_information.languages_total_count` | `languages_total_count` |
| `professional_information.certifications` | `certifications` |
| `professional_information.certifications_total_count` | `certifications_total_count` |
| `professional_information.projects` | `projects` |
| `professional_information.projects_total_count` | `projects_total_count` |
| `professional_information.volunteering_experience` | `volunteering_experience` |
| `professional_information.volunteering_experience_total_count` | `volunteering_experience_total_count` |
| `professional_information.recommendations` | `recommendations` |
| `professional_information.recommendations_given_count` | `recommendations_given_count` |
| `professional_information.recommendations_received_count` | `recommendations_received_count` |
| `linkedin_information.*` | matching top-level Phase 1 keys |
| `meta.built_from_profile_content_hash` | supplied by orchestrator from `profile_content_hash` |

Phase 3 validator will check paths like `personal_information.name`, `professional_information.job_title`, etc.

---

# Data Cleaning Rules

Apply **defensively** on Phase 1 output (idempotent):

| Type | Rule |
|------|------|
| Null | → `""` / `[]` / `0` / `False` as appropriate |
| Strings | trim whitespace |
| Lists | always `list` (never `None`) |
| Integers (`followers`, counts) | coerce via `_coerce_int` |
| Booleans (`creator_mode`, flags) | coerce via `_coerce_bool` |
| Nested dicts | recurse; skip non-dict list items |

**Never throw** because a normalized field is missing — return complete context with defaults.

**Do throw** (service layer → route maps to 500) when:

- Input is not a `dict` (programming error)
- JSON serialization fails after build (unexpected)

---

# Missing Data Handling

Profile Context must **always** be structurally complete (all keys present).

Sparse LinkedIn profiles → empty strings and empty lists, not omitted keys.

Phase 4 will **patch** missing fields into the stored `profile_context_json` without overwriting non-empty LinkedIn-sourced values.

---

# Caching and Database Strategy

Aligns with Phase 1 storage ownership table:

| Event | `normalized_profile_json` | `profile_context_json` |
|-------|---------------------------|------------------------|
| First acquire | written | built + written |
| Repeat GET (no refresh) | read cache | read cache |
| `?refresh=true` + same content | updated timestamp | unchanged if hash same |
| `?refresh=true` + content changed | updated | **NULLed** by `invalidate_downstream()` → rebuilt |
| Account reconnect (hash change) | updated | invalidated → rebuilt |

Context cache key: presence of non-null `profile_context_json` **and** matching `built_from_profile_content_hash` in stored JSON vs current `profile_content_hash`.

---

# Logging Requirements

Prefix: `[LinkedInProfileContext]`

```
[LinkedInProfileContext] build_profile_context start name=... experience_count=...
[LinkedInProfileContext] normalizing personal_information
[LinkedInProfileContext] normalizing professional_information skills_count=...
[LinkedInProfileContext] normalizing linkedin_information followers=...
[LinkedInProfileContext] build_profile_context complete schema_version=1
[LinkedInProfileContext] get_or_build_profile_context source=cache user_id=...
[LinkedInProfileContext] get_or_build_profile_context source=built user_id=...
```

Never log full profile text, tokens, or PII beyond safe metadata (counts, hash prefix).

---

# Exception Handling

| Layer | Pattern |
|-------|---------|
| `profile_context_builder.py` | Log + re-raise `ProfileContextBuildError` (new domain exception in `types.py`) |
| `profile_context_service.py` | Log + wrap unexpected errors |
| `linkedin_social_routes.py` | Catch domain errors → `HTTPException(500, "Unable to build LinkedIn profile context.")` |

Never silently swallow exceptions.

---

# API Changes

**No new endpoint.**

Extend existing:

```
GET /api/linkedin-social/profile
GET /api/linkedin-social/profile?refresh=true
```

Phase 3+ will add `profile_validation` to the same response per Phase 3 doc.

---

# Testing Checklist

## Complete profile

- All Phase 1 sections populated
- Context generated with matching counts
- Persisted to `profile_context_json`

## Partial profile

- Missing about, skills
- Context generated; empty defaults; no exceptions

## Invalid data types

- String followers in normalized input → integer in context

## Null values

- No crashes; empty defaults throughout

## Cache behavior

- Run 1: `profile_context_meta.source = "built"`
- Run 2: `profile_context_meta.source = "cache"` (no builder logs)
- After `--refresh` with changed profile: context rebuilt

## Backward compatibility

- Response still includes `profile` + `meta` unchanged
- Clients ignoring new fields continue to work

## Offline fixture

```bash
python backend/scripts/linkedin_fetch_profile.py \
  --from-fixture docs/linkedin/fixtures/sample_normalized_profile.json \
  --print-context
```

---

# Success Criteria

Phase 2 is complete when:

- Phase 1 normalized profile converts to `LinkedInProfileContext`
- Every field normalized with consistent defaults
- Missing values handled gracefully (no exceptions on sparse data)
- Grouped schema supports Phase 3 field paths and Phase 5 LLM input
- No AI, validation, or Unipile logic in Phase 2 code
- `profile_context_json` persisted and cache-first served
- `invalidate_downstream()` integration verified on hash change
- Detailed Loguru logging at each layer
- Exception handling follows route/service separation
- `GET /api/linkedin-social/profile` extended without breaking existing clients
- CLI gate passes

---

# Why This Phase Exists

LinkedIn data from APIs is inconsistent at the wire level — Phase 1 fixes that into a flat ALwrity profile.

Phase 2 creates ALwrity's **internal professional language**: a stable, grouped object that Phases 3–6 consume without touching raw LinkedIn responses or re-learning field layouts.

Future phases:

| Phase | Consumes | Writes |
|-------|----------|--------|
| 3 Validate | `profile_context_json` | `profile_validation_json` |
| 4 Complete | `profile_validation_json` | patches `profile_context_json`, `user_completion_json` |
| 5 Understand | completed `profile_context_json` | `ai_profile_intelligence_json` |
| 6 Recommend | `ai_profile_intelligence_json` | optional cache |

This separation keeps the architecture modular, maintainable, and easy to extend.

---

# Files to Create / Modify (Implementation Reference)

| File | Action |
|------|--------|
| `integrations/linkedin/profile_context_builder.py` | **Create** |
| `integrations/linkedin/profile_context_service.py` | **Create** |
| `integrations/linkedin/profile_repository.py` | **Extend** — context get/save |
| `integrations/linkedin/types.py` | **Extend** — context types, `ProfileContextBuildError` |
| `integrations/linkedin/field_coercion.py` | **Create** (optional) — shared coercers extracted from Phase 1 |
| `integrations/linkedin/profile_service.py` | **Minimal** — import coercers from shared module if extracted |
| `api/linkedin_social_routes.py` | **Extend** — wire context into GET /profile |
| `models/linkedin_social_models.py` | **Extend** — response + meta models |
| `scripts/linkedin_fetch_profile.py` | **Extend** — `--print-context` |

**Do not modify:** Unipile provider/client, OAuth flow, Phase 1 acquire logic beyond optional coercion extraction.
