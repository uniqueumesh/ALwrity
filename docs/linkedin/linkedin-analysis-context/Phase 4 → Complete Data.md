# ALwrity LinkedIn Writer
# Phase 4 → Complete Data

---

# Objective

Build the Adaptive Profile Completion module.

The purpose of this phase is to collect only the missing professional information identified by the Profile Completeness Validator (Phase 3).

This phase should NEVER ask unnecessary questions.

Instead, ALwrity should request only the information that Phase 3 reported as missing.

This phase contains **NO AI**.

No LLM.

No profile summary.

No topic generation.

Its only responsibility is completing the user's professional profile via deterministic, rule-based question mapping and context patching.

---

# Prerequisites

The following phases must already be completed.

✓ Phase 1 – LinkedIn Profile Fetch Foundation

✓ Phase 2 – Profile Context Builder

✓ Phase 3 – Profile Completeness Validator

This phase should **ONLY** consume:

```
profile_validation   (from profile_validation_json / GET /profile response)
profile_context      (from profile_context_json — for patch target only)
```

**Never:**

- Inspect raw LinkedIn / Unipile payloads
- Read `normalized_profile_json` to infer missing fields
- Re-implement Phase 3 validation rules inside completion code

---

# Scope

## In Scope

✅ Read `profile_validation.missing_fields` (and only ask for those keys)

✅ Generate profile completion questions from a static mapping

✅ Return questions on `GET /profile` when profile is incomplete

✅ Accept user answers via `POST /profile/complete`

✅ Patch `profile_context_json` for empty fields only (no overwrite)

✅ Persist raw user answers to `user_completion_json`

✅ Re-run Phase 3 validator after patch

✅ Persist updated `profile_validation_json`

✅ Add logging

✅ Add exception handling

✅ Unit + integration tests (Phase 3 rigor)

---

## Out of Scope

Do **NOT** implement:

- AI Profile Summary
- Topic Suggestions
- LLM / prompt logic of any kind
- Dynamic or conditional question branching (beyond static key → question map)
- Re-implementing validation rules (belongs in Phase 3)
- Reading raw LinkedIn data or normalized profile to detect gaps
- Modifying Phase 1 acquire or Phase 2 build pipelines
- OAuth / Unipile / token handling
- Analytics, Memory, Competitor Analysis, Growth Engine
- Frontend Phase 5 AI features
- Auto-generating or rewriting user answers
- Clearing or rebuilding profile context from scratch

---

# Architecture Principles

| Principle | Rule |
|-----------|------|
| Single input for gaps | `profile_validation.missing_fields` is the **only** source of truth for what to ask |
| No overwrite | Patch only fields that Phase 3 considers empty; never replace non-empty LinkedIn-derived values |
| Separation | Question generation, context patching, orchestration, and validation are separate modules |
| Persistence | Use existing `ProfileRepository`; extend with validation + completion helpers — do not bypass the repository |
| Revalidation | Always call Phase 3 `get_or_validate_profile_context()` after patch — never inline completeness checks |
| Deterministic | Static question map + static answer coercion — zero AI |

Phase dependency (writes):

| Phase | Reads | Writes |
|-------|-------|--------|
| 3 Validate | `profile_context_json` | `profile_validation_json` |
| **4 Complete** | `profile_validation_json`, `profile_context_json` | patches `profile_context_json`, `user_completion_json`, refreshes `profile_validation_json` |
| 5 Understand | completed `profile_context_json` | `ai_profile_intelligence_json` |

When Phase 1 `profile_content_hash` changes, `ProfileRepository.invalidate_downstream()` clears context + validation + AI columns. **`user_completion_json` is also cleared** on hash change (user answers may no longer match the refreshed LinkedIn snapshot).

---

# Purpose

The validator tells ALwrity **what information is missing.**

This module asks the user **only** for those fields, patches context, and re-validates.

```
Profile Context
        ↓
Profile Validation          ← Phase 3 output (input to Phase 4)
        ↓
Missing Fields              ← profile_validation.missing_fields only
        ↓
Generate Questions          ← static map (no AI)
        ↓
User Answers
        ↓
Patch Profile Context       ← empty fields only
        ↓
Persist user_completion_json
        ↓
Run Validation Again        ← Phase 3 service
        ↓
Return profile_context + profile_validation
```

The objective is to make the profile complete. Nothing more.

---

# Backend Architecture

All services live under the existing integrations path:

```
backend/services/integrations/linkedin/
```

| Module | Responsibility |
|--------|----------------|
| `profile_completion_questions.py` | Static `missing_field_key → question` map; cap at 5; priority ordering |
| `profile_context_patcher.py` | Apply answers to `LinkedInProfileContext` without overwrite |
| `profile_completion_service.py` | Orchestrate: load validation → questions → patch → persist → revalidate |
| `profile_validation_service.py` | *(Phase 3 — reuse, do not duplicate)* cache-first validate |
| `profile_validator.py` | *(Phase 3 — reuse, do not duplicate)* pure completeness rules |

**Do not** create `backend/services/linkedin/` (wrong path — breaks modular layout).

---

# Phase 3 Input Contract

Phase 4 must consume the standardized validation object from Phase 3:

```json
{
    "is_profile_complete": false,
    "completeness_score": 67,
    "missing_fields": ["about", "professional_background"],
    "optional_missing_fields": ["location"]
}
```

## Rules

1. Generate questions **only** for keys in `missing_fields`.
2. **Ignore** `optional_missing_fields` for question generation (never block completion).
3. If `is_profile_complete === true`, return zero questions and skip the completion UI.
4. Field keys must match Phase 3 exactly — share a single constants module (`profile_validation_types.py`) between Phase 3 and Phase 4. Do not invent alternate key names in the completion layer.

## Canonical `missing_fields` keys (aligned with Phase 3)

| Key | Context path | Notes |
|-----|--------------|-------|
| `name` | `personal_information.name` | Also sync `first_name` / `last_name` when parseable |
| `headline` | `personal_information.headline` | |
| `job_title` | `professional_information.job_title` | |
| `company` | `professional_information.company` | |
| `about` | `personal_information.about` | |
| `industry` | `professional_information.industry` | Only if Phase 3 marks required |
| `professional_background` | OR-group sentinel | Emitted when **all** of skills, experience, education are empty |
| `skills` | `professional_information.skills` | Emitted only when skills specifically missing (not OR-group) |
| `experience` | `professional_information.experience` | Same |
| `education` | `professional_information.education` | Same |

When `professional_background` is present, show **one** combined question (see Question Mapping). User answer is coerced into the most appropriate structure (default: skills list).

---

# Question Mapping

Questions must **NOT** be generated using AI.

Use the predefined static map in `profile_completion_questions.py`.

| `missing_fields` key | Question label | Input type |
|----------------------|----------------|------------|
| `name` | What is your full name? | text |
| `headline` | What is your professional headline? | text |
| `job_title` | What is your current job title? | text |
| `company` | Which company do you currently work for? | text |
| `about` | Tell us a little about yourself. | textarea |
| `industry` | Which industry do you work in? | text |
| `professional_background` | What are your primary professional skills, or briefly describe your experience or education? | textarea |
| `skills` | What are your primary professional skills? | tags (string list) |
| `experience` | Please briefly describe your professional experience. | textarea |
| `education` | What is your educational background? | textarea |

## Question cap and priority

- Maximum **5** questions per request.
- Priority order (when >5 missing): `name` → `headline` → `job_title` → `company` → `about` → `professional_background` → `skills` → `experience` → `education` → `industry`.
- Never ask for a key not listed in `missing_fields`.
- Never ask for a key whose context field is already non-empty (defensive check in patcher).

---

# Answer Coercion (Patch Rules)

User answers are plain strings or string lists. The patcher converts them into `LinkedInProfileContext` shapes.

Reuse `field_coercion.clean_str`, `coerce_list`, `coerce_int` from `field_coercion.py`.

| Key | User answer | Patched value |
|-----|-------------|---------------|
| `name` | `"Jane Doe"` | `personal_information.name`; split into first/last when possible |
| `headline`, `job_title`, `company`, `about`, `industry` | string | corresponding scalar field via `clean_str` |
| `skills` | `["Python", "FastAPI"]` | `[{"name": "Python", "endorsement_count": 0}, ...]`; update `skills_total_count` |
| `professional_background` | free text | If comma-separated → skills; else append one experience entry with `description` = text, empty title/company |
| `experience` | free text | Append `ProfileExperienceContext` with `description` = text, other fields empty defaults |
| `education` | free text | Append `ProfileEducationContext` with `school` = text, other fields empty defaults |

## No-overwrite rule

Before writing any field, evaluate emptiness using **the same helper Phase 3 uses** (`is_field_empty(value)` — shared in `profile_validation_types.py` or `profile_validator.py`).

- Empty string, whitespace-only, `None`, empty list → **may patch**
- Non-empty LinkedIn value → **skip**; log warning if user submitted an answer for that key

Example: LinkedIn headline `"Senior Software Engineer"` → never ask again; patcher must not overwrite even if client sends `headline` in the request.

---

# Updating Profile Context

After the user submits answers:

1. Load current `profile_context_json` from `ProfileRepository`.
2. Load current `profile_validation_json` — reject submission if `is_profile_complete` (409 or 400).
3. Validate answer keys ⊆ `missing_fields` (ignore unknown keys; log warning).
4. Merge answers into `user_completion_json` (accumulative dict keyed by field).
5. Apply patch via `profile_context_patcher.apply_completion_answers(context, answers, missing_fields)`.
6. Persist via `ProfileRepository.save_profile_context()` — does **not** touch `normalized_profile_json`.
7. Re-run Phase 3 validation; persist `profile_validation_json`.

Example patch (about only):

```
LinkedIn headline already set → untouched
Missing: about
User answer → "Backend Engineer with 8 years..."
Patch: profile_context.personal_information.about only
```

---

# Revalidation

After updating the profile, call the Phase 3 orchestrator:

```python
validation, meta = get_or_validate_profile_context(user_id, patched_context, ...)
```

Expected outcomes:

- `is_profile_complete = True` → frontend proceeds to Phase 5
- `is_profile_complete = False` → return remaining `missing_fields`; UI shows only those questions on next interaction

Phase 4 must **never** duplicate completeness scoring or OR-group logic.

---

# API Changes

## Extend existing GET (questions on read)

```
GET /api/linkedin-social/profile
```

Add to response when profile is incomplete:

```json
{
    "profile": {...},
    "profile_context": {...},
    "profile_validation": {
        "is_profile_complete": false,
        "completeness_score": 67,
        "missing_fields": ["about"],
        "optional_missing_fields": ["location"]
    },
    "profile_completion": {
        "questions": [
            {
                "field_key": "about",
                "label": "Tell us a little about yourself.",
                "input_type": "textarea",
                "required": true
            }
        ]
    }
}
```

When `is_profile_complete = true`, omit `profile_completion` or return `"questions": []`.

This mirrors Phase 3's approach (extend GET /profile rather than adding a questions-only endpoint).

## New POST (submit answers)

```
POST /api/linkedin-social/profile/complete
```

Request:

```json
{
    "answers": {
        "about": "Backend Engineer with 8 years of experience...",
        "skills": ["Python", "FastAPI"]
    }
}
```

Response:

```json
{
    "profile_context": {...},
    "profile_validation": {...},
    "profile_completion": {
        "questions": []
    }
}
```

HTTP errors:

| Status | Condition |
|--------|-----------|
| 400 | No analysis row; empty answers; all answer keys invalid |
| 409 | Profile already complete |
| 500 | Patch / persistence / revalidation failure (logged with traceback) |

---

# Frontend

Create under the existing LinkedIn Writer tree:

```
frontend/src/components/LinkedInWriter/components/ProfileCompletion/
    ProfileCompletionForm.tsx
    profileCompletionTypes.ts   (optional — question + answer types)
```

**Not** `components/linkedin/` (does not match project layout).

## Responsibilities

- Read `profile_validation` + `profile_completion.questions` from GET /profile
- If `is_profile_complete`, render nothing (skip to Phase 5)
- Display only returned questions (never hardcode field list)
- Collect answers; POST to `/profile/complete`
- Replace local state with response `profile_context` + `profile_validation`
- If still incomplete, re-render remaining questions from response

## UI copy

When incomplete:

```
Help us understand you better.
Please answer a few quick questions.
```

When complete after submit → proceed to Phase 5.

---

# Logging Requirements

Use Loguru. Prefix: `[ProfileCompletion]`

```
================================================
[ProfileCompletion] Starting profile completion
================================================
Reading validation result... missing_fields=['about']
Generating questions... count=1
Received user responses keys=['about']
Patching profile context (no-overwrite)... patched_fields=['about']
Persisted user_completion_json
Running validation again... is_profile_complete=True
Profile completion finished.
```

Never log full answer text at INFO (counts and field keys only). Use DEBUG sparingly if needed for local dev.

---

# Exception Handling

| Layer | Pattern |
|-------|---------|
| `profile_context_patcher.py` | Raise `ProfileCompletionPatchError` on invalid shape |
| `profile_completion_service.py` | Log + re-raise domain errors |
| `linkedin_social_routes.py` | Catch → `HTTPException(500, "Unable to complete LinkedIn profile.")` |

Always log full traceback via `logger.exception`. Never silently ignore failures.

---

# Files to Create / Modify

| File | Action |
|------|--------|
| `backend/services/integrations/linkedin/profile_validation_types.py` | **Create or extend (Phase 3)** — `ProfileValidationResult`, `MISSING_FIELD_KEYS`, shared `is_field_empty()` |
| `backend/services/integrations/linkedin/profile_validator.py` | **Phase 3 — reuse** — pure validation; no changes unless adding shared empty helper |
| `backend/services/integrations/linkedin/profile_validation_service.py` | **Phase 3 — reuse** — cache-first validate orchestrator |
| `backend/services/integrations/linkedin/profile_completion_questions.py` | **Create** — static map, priority, 5-question cap |
| `backend/services/integrations/linkedin/profile_context_patcher.py` | **Create** — no-overwrite patch + answer coercion |
| `backend/services/integrations/linkedin/profile_completion_service.py` | **Create** — orchestration only |
| `backend/services/integrations/linkedin/profile_repository.py` | **Extend** — `get/save_profile_validation`, `get/save_user_completion`; clear `user_completion_json` in `invalidate_downstream()` |
| `backend/models/linkedin_social_models.py` | **Extend** — `ProfileValidationResponse`, `CompletionQuestion`, `ProfileCompletionResponse`, `ProfileCompleteRequest`, extend `LinkedInProfileAcquireResponse` |
| `backend/api/linkedin_social_routes.py` | **Extend** — wire validation + questions on GET /profile; add POST /profile/complete |
| `frontend/src/components/LinkedInWriter/components/ProfileCompletion/ProfileCompletionForm.tsx` | **Create** |
| `frontend/src/components/LinkedInWriter/hooks/useLinkedInProfile.ts` (or extend existing profile hook) | **Extend** — fetch profile + submit completion |
| `backend/tests/services/integrations/linkedin/test_profile_completion_questions.py` | **Create** |
| `backend/tests/services/integrations/linkedin/test_profile_context_patcher.py` | **Create** |
| `backend/tests/services/integrations/linkedin/test_profile_completion_service.py` | **Create** |
| `backend/tests/api/test_linkedin_profile_complete_route.py` | **Create** |

**Do not modify:** Unipile provider, OAuth, Phase 1 acquire, Phase 2 builder logic (except shared coercion imports).

---

# Implementation Roadmap

Execute in order. Each step should be testable before moving on.

## Step 1 — Repository extensions

- Add `get_profile_validation()` / `save_profile_validation()` mirroring context get/save pattern.
- Add `get_user_completion()` / `save_user_completion()` (merge dict per submit).
- Update `invalidate_downstream()` to also `SET user_completion_json = NULL`.

**Verify:** unit tests for repo round-trip and invalidation clearing completion JSON.

## Step 2 — Question generator

- Implement `build_completion_questions(missing_fields: list[str]) -> list[CompletionQuestion]`.
- Apply priority order and 5-question cap.
- Handle `professional_background` sentinel.

**Verify:** `test_profile_completion_questions.py` — complete profile → `[]`; single/multiple missing; >5 missing truncates by priority; unknown keys ignored.

## Step 3 — Context patcher

- Implement `apply_completion_answers(context, answers, allowed_keys)` with no-overwrite.
- Share `is_field_empty()` with Phase 3 validator.
- Implement answer coercion table (skills list, experience/education append, professional_background default).

**Verify:** `test_profile_context_patcher.py` — patch empty about; refuse overwrite headline; skills coercion; OR-group text → skills or experience entry.

## Step 4 — Completion orchestrator

- Implement `complete_profile(user_id, answers)`:
  1. Load row + context + validation
  2. Guard: already complete → error
  3. Build questions from validation (for logging / response)
  4. Patch + save context + user_completion
  5. Call `get_or_validate_profile_context`
  6. Return context, validation, remaining questions

**Verify:** `test_profile_completion_service.py` with in-memory / temp SQLite repo mocks — full happy path; partial completion loop; no-op when nothing to patch.

## Step 5 — API wiring

- Extend GET `/profile` to include Phase 3 validation + completion questions (call validation service if not cached).
- Add POST `/profile/complete` with Pydantic models and HTTP error mapping.

**Verify:** `test_linkedin_profile_complete_route.py` — auth mock, 409 when complete, 200 with updated validation.

## Step 6 — Frontend

- `ProfileCompletionForm` driven entirely by API questions.
- Integrate into LinkedIn Writer onboarding / profile setup flow after profile fetch.

**Verify:** manual — incomplete fixture shows N questions; submit updates; complete profile hides form.

---

# Testing Strategy

Match Phase 3 rigor (~40+ tests across modules). Suggested cases:

## `test_profile_completion_questions.py`

| Case | Expected |
|------|----------|
| `is_profile_complete=True` | `[]` questions |
| Missing `about` only | 1 question, correct label + input_type |
| Missing `about` + `skills` | 2 questions |
| >5 missing fields | 5 questions, highest-priority keys |
| `professional_background` sentinel | 1 combined question |
| Key not in map | skipped + warning logged |

## `test_profile_context_patcher.py`

| Case | Expected |
|------|----------|
| Patch empty `about` | value set |
| Existing headline | unchanged despite answer present |
| Skills string list | `ProfileSkillContext[]` + count |
| Experience free text | new entry appended |
| Answer key not in `missing_fields` | ignored |
| Whitespace-only existing value | treated as empty (patch allowed) |

## `test_profile_completion_service.py`

| Case | Expected |
|------|----------|
| End-to-end: missing about → submit → complete | `is_profile_complete=True` |
| Partial: still missing fields after submit | reduced `missing_fields`, new questions |
| Already complete | raises / returns 409 at route layer |
| Persists `user_completion_json` | merged across submits |
| Revalidation invoked | `profile_validation_json` updated |

## `test_linkedin_profile_complete_route.py`

| Case | Expected |
|------|----------|
| GET /profile incomplete | includes `profile_completion.questions` |
| GET /profile complete | no questions |
| POST valid answers | 200 + updated validation |
| POST when complete | 409 |
| POST empty body | 400 |

## Regression

- Phase 3 validator tests still pass (no duplicated rules in Phase 4).
- GET /profile backward compatible for clients ignoring new fields.

---

# Testing Checklist (Manual / QA)

## Complete Profile

Expected: no questions displayed; POST /complete returns 409.

## Missing About

Expected: one question displayed.

## Missing About + Skills

Expected: two questions displayed.

## User submits answers

Expected: profile context updated; validator runs again.

## Validation Success

Expected: `is_profile_complete = True`; proceed to Phase 5.

## Validation Still Incomplete

Expected: only remaining questions displayed.

## LinkedIn data preserved

Expected: populated headline/job title unchanged after completion submit.

---

# Success Criteria

Phase 4 is complete when:

✅ Only missing questions are displayed (from `profile_validation.missing_fields`).

✅ Existing LinkedIn data is never overwritten.

✅ User answers update `profile_context_json` and `user_completion_json`.

✅ Profile validation automatically runs again after every successful submit.

✅ GET /profile returns questions; POST /profile/complete returns updated state.

✅ Detailed Loguru logging is implemented.

✅ Exception handling follows route/service separation.

✅ No AI / LLM logic exists anywhere in Phase 4 code.

✅ Automated test suite covers questions, patcher, service, and route layers.

✅ `invalidate_downstream()` clears user completion on profile hash change.

---

# Future Phases

This phase prepares the final Profile Context for AI analysis.

**Phase 5 — AI Profile Understanding** will receive a complete professional profile without needing to handle missing data.

Keeping profile completion separate from AI reasoning ensures the LinkedIn Writer remains modular, predictable, and easy to extend in future releases.
