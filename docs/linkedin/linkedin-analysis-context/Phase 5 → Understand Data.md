# ALwrity LinkedIn Writer
# Phase 5 → Understand Data (AI Profile Intelligence Engine)

**Updated:** 2026-06-19 (planning review — aligned with Phases 1–4 implementation)  
**Prerequisites:** Phases 1–4 complete; profile must be **complete** (`is_profile_complete === true`) before Phase 5 runs  
**Related:** Phase 4 doc §Architecture Principles; `ProfileRepository.ai_profile_intelligence_json`

---

# Planning Review Summary

The original Phase 5 direction is **correct** but required refinements before implementation:

| Area | Original doc | Required change |
|------|--------------|-----------------|
| Service path | `backend/services/linkedin/` | Use `backend/services/integrations/linkedin/` (matches Phases 1–4) |
| Module split | Single service file | Split: types, validator, LLM adapter, orchestrator (mirrors Phase 3/4) |
| Cache key | “Don't regenerate if context unchanged” (vague) | Hash **`LinkedInProfileContext`** itself — Phase 4 patches context without changing Phase 1 `profile_content_hash` |
| Validation | Manual JSON key checks | **Pydantic** models with `extra="forbid"` (same rigor as Phase 4) |
| LLM coupling | “Call LLM” inside service | Thin adapter over existing `gemini_structured_json_response`; prompts in `backend/prompts/` |
| HTTP errors | `HTTPException` in service example | Domain exceptions in service; `HTTPException` only in routes |
| Gate | Implicit | **Hard gate:** skip LLM when `is_profile_complete === false` |
| API | Extend workflow response | Extend existing `GET /api/linkedin-social/profile` only (no new endpoint) |

---

# Objective

Build ALwrity's first **AI Profile Intelligence Engine**.

Transform a **completed** `LinkedInProfileContext` into structured, validated AI intelligence that answers:

> Who is this LinkedIn professional?

This is the **first phase that introduces LLM** (default: **Gemini 2.5 Flash**).

The AI is **purely analytical** — stateless, read-only, idempotent (via cache).

It must **NOT**:

- Generate content ideas, posts, articles, or carousels
- Modify `LinkedInProfileContext` or any upstream JSON columns
- Read raw Unipile payloads or `normalized_profile_json`
- Invent facts not grounded in the provided context

---

# Prerequisites

✓ Phase 1 – LinkedIn Profile Fetch Foundation  
✓ Phase 2 – Profile Context Builder  
✓ Phase 3 – Profile Completeness Validator  
✓ Phase 4 – Adaptive Profile Completion  

**Single input:**

```
LinkedInProfileContext   (from profile_context_json)
```

**Hard gate (before any LLM call):**

```
profile_validation.is_profile_complete === true
```

If incomplete, return `ai_profile_intelligence: null` (or omit) and keep Phase 4 completion UI active.

Never consume raw LinkedIn / Unipile responses.

---

# Scope

## In Scope

✅ Read completed `LinkedInProfileContext`  
✅ Generate structured AI profile understanding (Gemini 2.5 Flash via existing provider)  
✅ Generate concise profile summary  
✅ Identify expertise, professional identity, knowledge domains  
✅ Identify **writing opportunity themes** (interpretive — not Phase 6 topic suggestions)  
✅ Validate LLM output with Pydantic  
✅ Cache in `ai_profile_intelligence_json` with context-hash linkage  
✅ Extend `GET /profile` response when profile is complete  
✅ Loguru logging + domain exceptions + route-level HTTP mapping  
✅ Unit tests (validator, cache logic, orchestrator with mocked LLM)

---

## Out of Scope

Do **NOT** implement:

- Topic Suggestions (Phase 6)
- Post / Article / Carousel Generation
- Growth Strategy
- Competitor Analysis
- Memory / Analytics
- Frontend AI UI beyond displaying intelligence when returned by GET /profile
- Writing back to `profile_context_json`, `user_completion_json`, or `profile_validation_json`
- Re-running Phase 3/4 logic inside Phase 5

---

# Architecture Principles

| Principle | Rule |
|-----------|------|
| Single source of truth | `LinkedInProfileContext` is the **only** LLM input |
| Read-only AI | Intelligence never mutates upstream data |
| Completeness gate | No LLM until Phase 3 reports complete |
| Cache-first | `get_or_generate_profile_intelligence()` mirrors `get_or_validate_profile_context()` |
| Context hash | Regenerate when **profile context content** changes — not only Phase 1 hash |
| Separation | Prompts in `backend/prompts/`; business logic in `services/integrations/linkedin/` |
| LLM decoupling | Service depends on an injectable `generate_fn`; default wraps `gemini_structured_json_response` |
| Validation | Pydantic parse + `extra="forbid"` — reject unknown/hallucinated top-level keys |
| Persistence | Extend existing `ProfileRepository` — do not bypass or duplicate storage |

Phase dependency (reads / writes):

| Phase | Reads | Writes |
|-------|-------|--------|
| 3 Validate | `profile_context_json` | `profile_validation_json` |
| 4 Complete | `profile_validation_json`, `profile_context_json` | patches `profile_context_json`, `user_completion_json`, refreshes `profile_validation_json` |
| **5 Understand** | `profile_context_json`, `profile_validation_json` | `ai_profile_intelligence_json`, `ai_intelligence_updated_at` |

When Phase 1 `profile_content_hash` changes, `ProfileRepository.invalidate_downstream()` already clears `ai_profile_intelligence_json`.  
When Phase 4 patches context **without** a Phase 1 refetch, Phase 1 hash is unchanged — Phase 5 **must** detect context edits via its own context hash (see Cache Strategy).

---

# Backend Architecture

All services live under:

```
backend/services/integrations/linkedin/
```

| Module | Responsibility |
|--------|----------------|
| `profile_intelligence_types.py` | Pydantic models + TypedDict meta; JSON schema export for Gemini |
| `profile_intelligence_validator.py` | Pure validation: parse dict → `AIProfileIntelligence`; no LLM |
| `profile_intelligence_llm.py` | Build prompt, call injectable LLM adapter, return raw dict |
| `profile_intelligence_service.py` | Orchestrate: gate → cache → LLM → validate → persist |
| `profile_repository.py` | *(extend)* `get_ai_profile_intelligence`, `save_ai_profile_intelligence`, `compute_profile_context_hash` |
| `profile_validation_service.py` | *(reuse)* completeness gate only — do not duplicate rules |

Prompts (no business logic):

```
backend/prompts/linkedin/profile_intelligence_prompt.py
```

**Do not** create `backend/services/linkedin/` (wrong path).

**Do not** put prompt strings inside `profile_intelligence_service.py`.

---

# Orchestration Flow

```
GET /profile
    ↓
Phases 1–4 (existing)
    ↓
is_profile_complete === false  →  skip Phase 5 (no LLM)
    ↓
is_profile_complete === true
    ↓
get_or_generate_profile_intelligence(user_id, profile_context)
    ↓
compute_profile_context_hash(profile_context)
    ↓
cached intelligence hash matches?  →  return cache (source=cache)
    ↓
build prompt from profile_intelligence_prompt.py
    ↓
profile_intelligence_llm.generate(...)   [Gemini 2.5 Flash, structured JSON]
    ↓
profile_intelligence_validator.validate(raw)
    ↓
ProfileRepository.save_ai_profile_intelligence(...)
    ↓
return intelligence (source=generated)
```

---

# Cache Strategy (Regeneration Triggers)

Phase 4 can update `profile_context_json` while Phase 1 `profile_content_hash` stays the same.  
Phase 5 cache key must be a **canonical hash of `LinkedInProfileContext`**, not Phase 1 hash alone.

## Add to `ProfileRepository`

```python
def compute_profile_context_hash(context: dict[str, Any]) -> str:
    """SHA-256 of canonical JSON (sort_keys=True) — same pattern as compute_profile_content_hash."""
```

## Store linkage inside intelligence payload

Each saved intelligence object includes meta:

```json
{
  "meta": {
    "built_from_profile_context_hash": "<sha256>",
    "schema_version": 1,
    "model": "gemini-2.5-flash"
  },
  "professional_identity": "...",
  "...": "..."
}
```

## Regenerate when **any** of:

1. `ai_profile_intelligence_json` is NULL (downstream invalidation or first run)
2. Cached `meta.built_from_profile_context_hash` ≠ `compute_profile_context_hash(current_context)`
3. `profile_context_updated_at` > `ai_intelligence_updated_at` (belt-and-suspenders)
4. Caller passes `force_regenerate=True` (optional query param `refresh_intelligence=true` on GET /profile)

## Do **not** regenerate when:

- Only `profile_validation_json` changed but context hash unchanged
- GET /profile called repeatedly with identical context (serve cache)

---

# AI Input

Serialize **only** `LinkedInProfileContext` to the user message (JSON string).

Exclude from prompt if present in future: any fields not part of the Phase 2 contract.

Never pass:

- `normalized_profile_json`
- `raw_userprofile_json`
- `user_completion_json` (answers are already merged into context by Phase 4)
- `profile_validation_json`

---

# AI Output Schema

Define in `profile_intelligence_types.py` as Pydantic `BaseModel`:

```python
class AIProfileIntelligence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    professional_identity: str
    primary_expertise: list[str]
    industry: str
    experience_level: str  # e.g. Junior | Mid | Senior | Executive | Unknown
    knowledge_domains: list[str]
    writing_opportunities: list[str]   # themes grounded in profile — NOT Phase 6 topics
    target_audience: list[str]
    communication_style: str
    brand_positioning: str
    summary: str
```

Example payload (after validation):

```json
{
  "meta": {
    "built_from_profile_context_hash": "abc123...",
    "schema_version": 1,
    "model": "gemini-2.5-flash"
  },
  "professional_identity": "Senior Backend Software Engineer",
  "primary_expertise": ["Python", "FastAPI", "System Design"],
  "industry": "Software Development",
  "experience_level": "Senior",
  "knowledge_domains": ["Backend Development", "Cloud APIs", "AI Applications"],
  "writing_opportunities": ["Backend Best Practices", "Scaling APIs", "AI Engineering"],
  "target_audience": ["Software Engineers", "Engineering Managers", "Technical Recruiters"],
  "communication_style": "Educational and Technical",
  "brand_positioning": "Experienced Backend Engineer sharing practical engineering knowledge.",
  "summary": "..."
}
```

**Sparse profile rule:** scalar fields use `"Unknown"` when context lacks evidence; lists may be empty `[]` — never fabricate specific employers, titles, or skills.

---

# Prompt Design

File: `backend/prompts/linkedin/profile_intelligence_prompt.py`

Exports:

- `PROFILE_INTELLIGENCE_SYSTEM_PROMPT: str`
- `build_profile_intelligence_user_prompt(context: dict[str, Any]) -> str`

System prompt must instruct the model to:

- Analyze **only** the provided Profile Context JSON
- Do not invent facts; cite nothing outside the JSON
- Use `"Unknown"` for scalars when evidence is missing
- Return JSON matching the schema exactly — no markdown fences
- Be objective and concise; avoid marketing hype
- `writing_opportunities` = professional themes implied by the profile — not post titles or hashtags

User prompt = compact JSON dump of `LinkedInProfileContext`.

---

# LLM Integration (Decoupled)

Default implementation in `profile_intelligence_llm.py`:

```python
from services.llm_providers.gemini_provider import gemini_structured_json_response
from services.integrations.linkedin.profile_intelligence_types import (
    ai_profile_intelligence_json_schema,
)

async def call_profile_intelligence_llm(
    *,
    system_prompt: str,
    user_prompt: str,
    user_id: str | None = None,
    generate_fn=gemini_structured_json_response,
) -> dict[str, Any]:
    ...
```

Parameters:

| Param | Value |
|-------|-------|
| Model | `gemini-2.5-flash` (via existing provider defaults) |
| Temperature | `0.2` (consistent structured output) |
| max_tokens | `4096` (adjust if truncation in tests) |
| Schema | Derived from Pydantic `model_json_schema()` |

Service accepts injected `generate_fn` for unit tests — **no network in tests**.

Optional: wire existing usage tracking (`agent_usage_tracking`) with `user_id` when available.

Do **not** import OpenAI/Anthropic in the orchestrator unless adding swappable providers later via the same adapter interface.

---

# Response Validation

Validation pipeline (no manual key walking):

1. LLM returns dict (structured output from Gemini)
2. `AIProfileIntelligence.model_validate(raw)` — Pydantic v2
3. Post-checks in validator module:
   - No empty string for required scalars except allowed `"Unknown"`
   - List items: non-empty strings after strip
   - Reject extra top-level keys (`extra="forbid"`)
4. Attach `meta` server-side (never trust LLM for hash / model / schema_version)

On failure:

```
logger.error + ProfileIntelligenceValidationError
```

Retry policy:

- **One** retry on validation failure with appended instruction: “Previous response failed schema validation; return valid JSON only.”
- If still invalid → raise `ProfileIntelligenceLLMError` (routes → 503 or 500)

Never accept partial or unvalidated intelligence.

---

# Storage

Column (already exists):

```
linkedin_analysis_context.ai_profile_intelligence_json
linkedin_analysis_context.ai_intelligence_updated_at
```

## Repository methods to add

| Method | Behavior |
|--------|----------|
| `get_ai_profile_intelligence(user_id, row=None)` | Parse JSON; return `None` if missing/invalid |
| `save_ai_profile_intelligence(user_id, intelligence, *, context_hash)` | Persist JSON + set `ai_intelligence_updated_at` |

Mirror logging/style of `get_profile_validation` / `save_profile_validation`.

---

# Service API

```python
class ProfileIntelligenceAcquireMeta(TypedDict):
    source: Literal["cache", "generated"]
    ai_intelligence_updated_at: str | None


def get_or_generate_profile_intelligence(
    user_id: str,
    profile_context: dict[str, Any],
    *,
    profile_validation: ProfileValidationResult,
    repository: ProfileRepository | None = None,
    force_regenerate: bool = False,
    generate_fn=...,
) -> tuple[AIProfileIntelligence | None, ProfileIntelligenceAcquireMeta]:
    """
    Returns (None, meta) when profile incomplete.
    Raises ProfileIntelligenceError subclasses on LLM/validation failure.
    """
```

---

# API Changes

Extend existing endpoint only:

```
GET /api/linkedin-social/profile
```

Optional query param:

```
refresh_intelligence=false   # when true, force_regenerate=True
```

When `is_profile_complete === true`, add:

```json
{
  "profile_context": { "...": "..." },
  "profile_validation": { "is_profile_complete": true, "...": "..." },
  "ai_profile_intelligence": {
    "professional_identity": "...",
    "primary_expertise": [],
    "industry": "...",
    "experience_level": "...",
    "knowledge_domains": [],
    "writing_opportunities": [],
    "target_audience": [],
    "communication_style": "...",
    "brand_positioning": "...",
    "summary": "..."
  },
  "ai_profile_intelligence_meta": {
    "source": "cache",
    "ai_intelligence_updated_at": "2026-06-19T12:00:00"
  }
}
```

When incomplete: omit `ai_profile_intelligence` (or explicit `null`) — **do not** call LLM.

Update `LinkedInProfileAcquireResponse` in `backend/models/linkedin_social_models.py`.

Wire in `linkedin_social_routes.py` **after** Phase 3/4 block — same pattern as validation.

Also return intelligence on `POST /profile/complete` when the response transitions to complete (optional but improves UX).

No dedicated `/profile/intelligence` endpoint unless a future phase requires it.

---

# Logging Requirements

Prefix: `[ProfileIntelligence]`

```
================================================
[ProfileIntelligence] Starting AI profile understanding
================================================
Gate check... is_profile_complete=True
Reading Profile Context... context_hash=abc123...
Cache lookup... hit|miss
Preparing LLM prompt...
Sending request to LLM... model=gemini-2.5-flash
AI response received.
Validating AI response... ok|failed
Persisted ai_profile_intelligence_json
AI Profile Intelligence finished source=cache|generated
```

Never log full profile context or intelligence at INFO (hash + field counts only).

---

# Exception Handling

| Layer | Pattern |
|-------|---------|
| `profile_intelligence_validator.py` | Raise `ProfileIntelligenceValidationError` |
| `profile_intelligence_llm.py` | Raise `ProfileIntelligenceLLMError` on provider failures |
| `profile_intelligence_service.py` | Log via `logger.exception`; re-raise domain errors |
| `linkedin_social_routes.py` | Map to `HTTPException(503, "Unable to generate AI profile intelligence.")` |

**Never** raise `HTTPException` from service modules.

| Status | Condition |
|--------|-----------|
| — | Profile incomplete → no error; intelligence omitted |
| 503 | LLM unavailable / quota / repeated validation failure |
| 500 | Unexpected persistence failure |

---

# Files to Create / Modify

## Create

| File | Purpose |
|------|---------|
| `backend/prompts/linkedin/profile_intelligence_prompt.py` | System + user prompt builders |
| `backend/services/integrations/linkedin/profile_intelligence_types.py` | Pydantic models + schema export |
| `backend/services/integrations/linkedin/profile_intelligence_validator.py` | Pure validation |
| `backend/services/integrations/linkedin/profile_intelligence_llm.py` | LLM adapter (injectable) |
| `backend/services/integrations/linkedin/profile_intelligence_service.py` | Cache-first orchestrator |
| `backend/tests/services/integrations/linkedin/test_profile_intelligence_validator.py` | Validator unit tests |
| `backend/tests/services/integrations/linkedin/test_profile_intelligence_service.py` | Orchestrator + mock LLM |

## Modify

| File | Change |
|------|--------|
| `profile_repository.py` | `compute_profile_context_hash`, get/save intelligence |
| `linkedin_social_models.py` | Response models for intelligence + meta |
| `linkedin_social_routes.py` | Call orchestrator on GET /profile (and optionally POST /complete) |
| `frontend/src/api/linkedinSocial.ts` | Types for new response fields (display-only) |

---

# Implementation Roadmap

Execute in order. Each step must be testable before moving on. **Do not implement Phase 5 in one go.**

## Step 1 — Repository extensions

- Add `compute_profile_context_hash(context)` (mirror `compute_profile_content_hash` pattern).
- Add `get_ai_profile_intelligence()` / `save_ai_profile_intelligence()` mirroring validation get/save.
- Persist `ai_intelligence_updated_at` on save.

**Verify:** unit tests for hash stability (same context → same hash), round-trip get/save, invalid JSON → `None`.

## Step 2 — Types + validator (no LLM)

- Create `profile_intelligence_types.py` — Pydantic `AIProfileIntelligence`, meta model, JSON schema export.
- Create `profile_intelligence_validator.py` — pure parse + post-checks; domain exceptions.
- Attach `meta` server-side after validation (hash, schema_version, model).

**Verify:** `test_profile_intelligence_validator.py` — valid payload; extra keys rejected; `"Unknown"` scalars; empty list items rejected.

## Step 3 — Prompts

- Create `backend/prompts/linkedin/profile_intelligence_prompt.py`.
- Export system prompt + `build_profile_intelligence_user_prompt(context)`.
- No imports from services or repository.

**Verify:** prompt builder returns JSON-serialized context only; no business logic in prompt module.

## Step 4 — LLM adapter

- Create `profile_intelligence_llm.py` — calls injectable `generate_fn` (default: `gemini_structured_json_response`).
- Wire Pydantic-derived schema, temperature `0.2`, model `gemini-2.5-flash`.
- Raise `ProfileIntelligenceLLMError` on provider failure.

**Verify:** unit test with mock `generate_fn` — no network; assert schema + prompt args passed correctly.

## Step 5 — Orchestrator

- Create `profile_intelligence_service.py` — `get_or_generate_profile_intelligence()`.
- Gate on `is_profile_complete`; cache-first via context hash; one validation retry.
- Never call LLM when profile incomplete.

**Verify:** `test_profile_intelligence_service.py` — cache hit (mock LLM called once); hash mismatch regenerates; incomplete profile → `None`; force_regenerate bypasses cache.

## Step 6 — API wiring

- Extend `linkedin_social_models.py` — `AIProfileIntelligenceResponse`, meta, optional fields on acquire response.
- Wire orchestrator in `GET /profile` after Phase 3/4 block; optional `refresh_intelligence` query param.
- Optionally return intelligence on `POST /profile/complete` when profile becomes complete.
- Route-level HTTP mapping only (`503` / `500`).

**Verify:** `test_linkedin_profile_route.py` (extend) — incomplete profile omits intelligence; complete profile with mock LLM returns payload; cache meta `source=cache|generated`.

## Step 7 — Frontend types (minimal)

- Extend `frontend/src/api/linkedinSocial.ts` with intelligence + meta types.
- No new UI required for Phase 5 completion — display can follow in a later polish pass.

**Verify:** TypeScript compiles; existing profile hook tolerates new optional fields.

---

# Testing Checklist

## Complete profile + cache hit

- First GET → LLM called, intelligence persisted, `source=generated`
- Second GET (same context) → no LLM call, `source=cache`

## Phase 4 patch invalidates intelligence

- Complete profile via POST /complete → intelligence generated
- Patch context (simulate hash change) → next GET regenerates

## Incomplete profile gate

- `is_profile_complete=false` → orchestrator returns `None`, LLM never invoked

## Sparse profile

- Output uses `"Unknown"` / empty lists; validator accepts; no fabricated employers

## Invalid LLM response

- Mock returns bad JSON → validation error → one retry → then 503

## Pydantic rejection

- Extra top-level key → `ProfileIntelligenceValidationError`

## Idempotency

- Parallel GETs with same context → single generation (or safe duplicate write of identical hash)

---

# Success Criteria

Phase 5 is complete when:

✅ AI understands the professional profile from `LinkedInProfileContext` only  
✅ Structured intelligence validated by Pydantic before persistence  
✅ Cache keyed on **profile context hash** — no redundant LLM calls  
✅ Incomplete profiles never trigger LLM  
✅ Prompts isolated under `backend/prompts/linkedin/`  
✅ LLM provider decoupled via injectable adapter  
✅ Logging + domain exceptions match Phases 3–4  
✅ GET /profile extended; tests cover validator + orchestrator  

---

# Future Phases

AI Profile Intelligence becomes the foundation for:

- Personalized Topic Recommendations (Phase 6)
- LinkedIn Post / Article / Carousel Generation
- Comment Suggestions
- AI Writing Assistant
- Growth Strategy
- Personal Brand Insights

Future AI features consume **`ai_profile_intelligence_json`** — not raw profile context — keeping ALwrity efficient, consistent, and scalable.
