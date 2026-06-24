# ALwrity LinkedIn Writer
# Phase 6 – Personalized Content Recommendation Engine

**Updated:** 2026-06-19 (planning review — aligned with Phases 1–5 implementation and UX requirements)  
**Prerequisites:** Phases 1–5 complete; profile must be **complete** and **AI Profile Intelligence** must exist before Phase 6 runs  
**Related:** Phase 5 doc §Architecture Principles; `ProfileRepository.ai_profile_intelligence_json`

---

# Planning Review Summary

The original Phase 6 direction is **correct** but required refinements before implementation:

| Area | Original doc | Required change |
|------|--------------|-----------------|
| Service path | `backend/services/linkedin/` | Use `backend/services/integrations/linkedin/` (matches Phases 1–5) |
| Module split | Single service file | Split: types, prompt, LLM adapter, validator, orchestrator (mirrors Phase 5) |
| Cache | Not specified | **Cache-first** — regenerate only when intelligence hash changes |
| LLM timing | Implicit sync on GET /profile | Gate on completeness; skeleton UI while loading; optional `refresh_recommendations` |
| API meta | Not specified | Add `recommendations_meta` (`source`, `recommendations_updated_at`) like Phase 5 |
| API errors | 500-only example | **Graceful degradation** — profile + intelligence still return; set `recommendations_error` with friendly copy |
| Recommendation IDs | Not specified | Server assigns stable `id` (uuid) per item for Phase 7 "Generate content" |
| Phase 5 overlap | Not addressed | Prompt must expand on `writing_opportunities`; do not repeat verbatim |
| Frontend path | `components/linkedin/Recommendations/` | Use `frontend/src/components/LinkedInWriter/components/TopicRecommendations/` |
| Component name | `ContentRecommendations.tsx` | **`TopicRecommendationsPanel.tsx`** — existing `ContentRecommendations.tsx` is post-quality tips (different feature) |
| User-facing copy | Raw API field names in UI | Frontend maps technical values to plain language (see UI Design) |
| Charts | Not specified | **Do not use Recharts** — growth impact is categorical; use colored pills |
| Profile header | Not specified | Compact bar: hide name, avatar status dot, inline Connected badge |

---

# User-Friendly Requirements

Phase 6 is the first **user-facing advisor** feature. Backend correctness is not enough — the experience must feel calm and actionable for non-technical users.

| Requirement | Implementation |
|-------------|------------------|
| No jargon in UI | Map `growth_impact: "High"` → "Strong reach potential"; `"LinkedIn Post"` → "Post" |
| No blocking failures | If recommendations fail, show profile + intelligence; display soft error + Retry |
| No long blank waits | Show 3 skeleton cards (not 5) while generating |
| No information overload | Progressive disclosure on cards — title + badges first; audience capped at 2 chips + "+N" |
| No duplicate ideas | LLM prompt: build on Phase 5 `writing_opportunities`, never copy verbatim |
| No scary errors | Log full traceback server-side; user sees: "We couldn't load suggestions right now. Try again." |

---

# Objective

Build the Personalized Content Recommendation Engine.

The purpose of this phase is to generate **five** personalized LinkedIn content recommendations based on the user's **AI Profile Intelligence**.

This is the first feature where ALwrity starts acting like an intelligent LinkedIn content advisor.

The recommendations should help the user grow their LinkedIn presence by suggesting content that matches their professional background, expertise, and audience.

This phase should **NOT** generate the actual content.

It should only recommend what the user should write next.

---

# Prerequisites

The following phases must already be completed.

✓ Phase 1 – LinkedIn Profile Fetch Foundation  
✓ Phase 2 – Profile Context Builder  
✓ Phase 3 – Profile Completeness Validator  
✓ Phase 4 – Adaptive Profile Completion  
✓ Phase 5 – AI Profile Intelligence Engine  

**Single input:**

```
AIProfileIntelligence   (from ai_profile_intelligence_json — LLM fields only, no raw profile)
```

**Hard gate (before any LLM call):**

```
profile_validation.is_profile_complete === true
AND ai_profile_intelligence is present
```

If incomplete or intelligence is missing, return `recommendations: null` and keep Phase 4 completion UI active.

Never use raw LinkedIn profile data or `LinkedInProfileContext` directly.

---

# Scope

## In Scope

✅ Read AI Profile Intelligence  
✅ Generate five personalized content recommendations  
✅ Explain why each recommendation fits the user  
✅ Recommend the most suitable content format (Post or Article only)  
✅ Identify the target audience  
✅ Estimate the potential growth impact (High / Medium / Low)  
✅ Assign stable `id` per recommendation (server-side uuid)  
✅ Validate LLM output with Pydantic  
✅ Cache in `topic_recommendations_json` with intelligence-hash linkage  
✅ Extend `GET /api/linkedin-social/profile` response when profile is complete  
✅ Add `recommendations_meta` and optional `recommendations_error`  
✅ Loguru logging + domain exceptions + route-level HTTP mapping  
✅ Frontend: compact profile header + topic recommendation cards  
✅ Unit tests (validator, cache logic, orchestrator with mocked LLM)

---

## Out of Scope

Do **NOT** implement:

- LinkedIn Post / Article / Carousel / Image / Video **Generation**
- Content Publishing or Scheduling
- Analytics or Competitor Analysis
- "Generate Content" button on recommendation cards (Phase 7+)
- Recharts or other charts for growth impact
- Copilot chat integration for topic recommendations
- Writing back to `profile_context_json`, `ai_profile_intelligence_json`, or upstream columns
- New standalone API endpoint (unless load times force lazy-load later)

---

# Purpose

The recommendation engine should answer one simple question.

> What should this professional write next on LinkedIn?

Every recommendation should feel personalized to the user's profile and professional goals.

Avoid generic motivational or trending content.

Recommendations should be based on the user's expertise and professional identity.

---

# Architecture Principles

| Principle | Rule |
|-----------|------|
| Single source of truth | `AIProfileIntelligence` is the **only** LLM input |
| Completeness gate | No LLM until Phase 3 reports complete **and** Phase 5 intelligence exists |
| Cache-first | `get_or_generate_topic_recommendations()` mirrors `get_or_generate_profile_intelligence()` |
| Intelligence hash | Regenerate when **AI profile intelligence content** changes |
| Separation | Prompts in `backend/prompts/`; business logic in `services/integrations/linkedin/` |
| LLM decoupling | Service depends on injectable `generate_fn`; default wraps `gemini_structured_json_response` |
| Validation | Pydantic parse + `extra="forbid"` — reject unknown keys |
| Persistence | Extend existing `ProfileRepository` — do not bypass or duplicate storage |
| Graceful errors | Recommendation failure must not fail the entire GET /profile response |
| UX-first API | Backend keeps schema field names; frontend owns plain-language labels |

Phase dependency (reads / writes):

| Phase | Reads | Writes |
|-------|-------|--------|
| 5 Understand | `profile_context_json` | `ai_profile_intelligence_json` |
| **6 Recommend** | `ai_profile_intelligence_json`, `profile_validation_json` | `topic_recommendations_json`, `recommendations_updated_at` |

When `ai_profile_intelligence_json` is invalidated or regenerated, Phase 6 cache must be cleared or treated as stale.

---

# Backend Architecture

All services live under:

```
backend/services/integrations/linkedin/
```

| Module | Responsibility |
|--------|----------------|
| `topic_recommendation_types.py` | Pydantic models + TypedDict meta; JSON schema export for Gemini |
| `topic_recommendation_validator.py` | Pure validation: parse dict → recommendations list; no LLM |
| `topic_recommendation_llm.py` | Build prompt, call injectable LLM adapter, return raw dict |
| `topic_recommendation_service.py` | Orchestrate: gate → cache → LLM → validate → persist |
| `profile_repository.py` | *(extend)* `get_topic_recommendations`, `save_topic_recommendations`, hash helpers |

Prompts (no business logic):

```
backend/prompts/linkedin/topic_recommendation_prompt.py
```

**Do not** create `backend/services/linkedin/` (wrong path).

**Do not** put prompt strings inside `topic_recommendation_service.py`.

**Do not** duplicate calendar/content-planning `ContentRecommendationGenerator` — that is a separate domain.

---

# Orchestration Flow

```
GET /profile
    ↓
Phases 1–5 (existing)
    ↓
is_profile_complete === false  OR  ai_profile_intelligence missing  →  skip Phase 6 (no LLM)
    ↓
get_or_generate_topic_recommendations(user_id, ai_profile_intelligence)
    ↓
compute_ai_intelligence_hash(ai_profile_intelligence)
    ↓
cached recommendations hash matches?  →  return cache (source=cache)
    ↓
build prompt from topic_recommendation_prompt.py
    ↓
topic_recommendation_llm.generate(...)   [Gemini 2.5 Flash, structured JSON]
    ↓
topic_recommendation_validator.validate(raw)
    ↓
assign uuid id to each recommendation (server-side)
    ↓
ProfileRepository.save_topic_recommendations(...)
    ↓
return recommendations (source=generated)
```

On LLM/validation failure after retry: log exception, set `recommendations: null` and `recommendations_error` — **do not** raise 500 for the whole GET /profile.

---

# Cache Strategy

Phase 6 cache key must be a **canonical hash of `AIProfileIntelligence`** (or reuse `meta.built_from_profile_context_hash` from stored intelligence if unchanged).

## Regenerate when **any** of:

1. `topic_recommendations_json` is NULL (first run or invalidation)
2. Cached `meta.built_from_intelligence_hash` ≠ current intelligence hash
3. `ai_intelligence_updated_at` > `recommendations_updated_at`
4. Caller passes `force_regenerate=True` (query param `refresh_recommendations=true` on GET /profile)

## Do **not** regenerate when:

- GET /profile called repeatedly with identical intelligence (serve cache)
- Profile incomplete (skip entirely)

## Stored payload meta

```json
{
  "meta": {
    "built_from_intelligence_hash": "<sha256>",
    "schema_version": 1,
    "model": "gemini-2.5-flash"
  },
  "recommendations": [ ... ]
}
```

---

# AI Input

Input should **ONLY** be:

```
AIProfileIntelligence
```

Do not send raw LinkedIn profile data.

Do not send the Profile Context.

The AI Profile Intelligence already contains everything required, including `writing_opportunities` (use as thematic seeds — expand, do not duplicate).

---

# AI Output

The AI must return structured JSON.

Generate exactly **five** recommendations.

Server adds `id` (uuid) to each item **after** validation, before persistence.

Example (LLM output — no `id` yet):

```json
{
  "recommendations": [
    {
      "title": "5 FastAPI mistakes that slow down production APIs",
      "why_this_fits": "Your profile highlights strong backend development expertise and API engineering experience.",
      "recommended_format": "LinkedIn Post",
      "target_audience": [
        "Software Engineers",
        "Engineering Managers"
      ],
      "growth_impact": "High"
    }
  ]
}
```

Example (API response item — includes server `id`):

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "title": "5 FastAPI mistakes that slow down production APIs",
  "why_this_fits": "Your profile highlights strong backend development expertise and API engineering experience.",
  "recommended_format": "LinkedIn Post",
  "target_audience": ["Software Engineers", "Engineering Managers"],
  "growth_impact": "High"
}
```

Always return exactly five recommendations.

---

# Recommendation Rules

Every recommendation should:

- Be relevant to the user's expertise
- Help strengthen the user's professional brand
- Target the correct audience
- Be realistic to write
- Encourage thought leadership
- Expand on (not copy) Phase 5 `writing_opportunities`

Avoid:

- Generic motivational quotes
- Viral clickbait
- Irrelevant topics
- Content unrelated to the user's profession
- Verbatim repeats of `writing_opportunities` strings

---

# Recommended Content Formats

Only recommend one of:

- `LinkedIn Post`
- `LinkedIn Article`

Future phases may support Carousel, Image Post, Video — do not recommend these yet.

---

# Growth Impact

Estimate the expected impact of the recommendation.

**Allowed values:** `High` | `Medium` | `Low`

Based on user expertise, target audience, and professional relevance.

This is only an estimate, not a prediction.

**Frontend display mapping (UI only — API keeps enum values):**

| API value | UI label | Pill color |
|-----------|----------|------------|
| `High` | Strong reach potential | Green (`#ecfdf5` / `#047857`) |
| `Medium` | Good reach potential | Amber (`#fffbeb` / `#92400e`) |
| `Low` | Niche reach potential | Slate (`#f1f5f9` / `#475569`) |

---

# AI Prompt Design

The system prompt should instruct the LLM to:

- Read only the provided AI Profile Intelligence
- Recommend exactly five personalized content ideas
- Expand on `writing_opportunities` without repeating them verbatim
- Explain why each recommendation fits the user (concise, second person: "your expertise…")
- Recommend the most suitable content format (Post or Article only)
- Identify the expected audience (1–4 items)
- Estimate growth impact (High / Medium / Low)
- Return valid JSON only
- Do not generate the actual post or article body

The prompt should be clear, concise, and deterministic.

---

# Response Validation

Validate the AI response before returning it.

Check:

- Valid JSON
- Exactly five recommendations
- Required fields present: `title`, `why_this_fits`, `recommended_format`, `target_audience`, `growth_impact`
- Correct data types (`target_audience` is non-empty list of strings)
- `recommended_format` ∈ {`LinkedIn Post`, `LinkedIn Article`}
- `growth_impact` ∈ {`High`, `Medium`, `Low`}
- No empty strings in required fields

If validation fails:

1. Log the error
2. Retry once with validation retry suffix (same pattern as Phase 5)
3. If still failing: set `recommendations_error` on API response; do not crash GET /profile

---

# API Changes

Extend the existing `GET /api/linkedin-social/profile` response.

Do not create a new endpoint unless load times require lazy-load in a future iteration.

**Query params (extend existing):**

| Param | Default | Purpose |
|-------|---------|---------|
| `refresh_recommendations` | `false` | Force regeneration (parallel to `refresh_intelligence`) |

**Response example:**

```json
{
  "profile_context": { "...": "..." },
  "profile_validation": { "...": "..." },
  "ai_profile_intelligence": { "...": "..." },
  "ai_profile_intelligence_meta": { "source": "cache" },
  "recommendations": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "title": "...",
      "why_this_fits": "...",
      "recommended_format": "LinkedIn Post",
      "target_audience": ["Software Engineers"],
      "growth_impact": "High"
    }
  ],
  "recommendations_meta": {
    "source": "cache",
    "recommendations_updated_at": "2026-06-19T10:00:00Z"
  },
  "recommendations_error": null
}
```

When generation fails:

```json
{
  "recommendations": null,
  "recommendations_meta": null,
  "recommendations_error": "We couldn't load content suggestions right now. Please try again."
}
```

**Pydantic models:** extend `backend/models/linkedin_social_models.py`.

**Route wiring:** extend `backend/api/linkedin_social_routes.py` after the Phase 5 block.

---

# Exception Handling

Use domain exceptions in the service layer (`TopicRecommendationError`, `TopicRecommendationValidationError`, `TopicRecommendationLLMError`).

Map to HTTP only when a dedicated recommendations endpoint exists. For GET /profile:

```python
try:
    recommendations, meta = get_or_generate_topic_recommendations(...)
except TopicRecommendationLLMError:
    logger.exception("[TopicRecommendation] LLM failed user_id={}", user_id)
    recommendations = None
    recommendations_error = "We couldn't load content suggestions right now. Please try again."
```

Always log full traceback.

Never silently ignore failures.

Never fail the entire profile response because recommendations failed.

---

# UI Design

## Placement

**Primary location:** `LinkedInProfileSetupPanel` — below the profile header, **only when** `isProfileComplete === true`.

Entry path: `WelcomeMessage` → `LinkedInConnectionPlaceholder` → `LinkedInProfileSetupPanel` (Unipile connected users).

Today the panel renders the connected profile card and stops when the profile is complete — that empty zone is the Phase 6 placeholder.

**Do not** place topic recommendations in the Copilot chat. The existing `ContentRecommendations.tsx` component is for **post-generation quality tips** — a different feature.

---

## Compact Profile Header

Refactor `LinkedInConnectedProfileCard` from a tall centered card to a **compact horizontal bar**:

```
┌─────────────────────────────────────────────────────────────┐
│  [Avatar 48px + green dot]     ● Connected    [Disconnect]  │
└─────────────────────────────────────────────────────────────┘
```

| Change | Detail |
|--------|--------|
| Hide name | Remove `displayName` heading — user already knows their identity |
| Connected status | Keep existing pill: green dot + "Connected" (`#10b981` on `#ecfdf5`) |
| Avatar status dot | 10px circle at bottom-right of avatar; `border: 2px solid #fff` |
| Layout | Row, left-aligned; disconnect button top-right (match `LinkedInAnalyticsDashboard`) |
| Height | Reduce card `minHeight` from 180px to ~80px |
| Styles | Reuse `linkedInPlaceholderCardStyles` and existing disconnect button styles |

---

## Topic Recommendations Section

**New components:**

```
frontend/src/components/LinkedInWriter/components/TopicRecommendations/
  TopicRecommendationsPanel.tsx    — section wrapper + loading/error/empty states
  TopicRecommendationCard.tsx      — single recommendation card
```

**Section header:**

- Title: **What to write next**
- Subtitle: *Five ideas tailored to your profile*
- Optional meta line from `recommendations_meta.recommendations_updated_at`: *Updated 2 hours ago*

**Card layout** (reuse tile styling from `AnalyticsMetricGrid` — white card, `#e2e8f0` border, 12px radius):

```
┌──────────────────────────────────────────────────┐
│ ①  5 FastAPI mistakes that slow production APIs  │  ← title, 16px semibold
│    [Post]  [Strong reach potential]              │  ← format chip + impact pill
│                                                  │
│    Why this fits you                             │  ← 12px muted label
│    Your backend expertise makes this credible…   │  ← 14px body, max 2 lines
│                                                  │
│    For: Software Engineers · Engineering Mgrs    │  ← audience chips (max 2 + "+N")
└──────────────────────────────────────────────────┘
```

**Design rules:**

- One primary read per card: the **title**
- Badges, not charts — **no Recharts** for growth impact
- Audience: max 2 chips visible + "+N more" with tooltip
- Number badges: subtle `#0A66C2` circle (consistent with existing LinkedIn Writer UI)
- Glass section wrapper: `linkedInPlaceholderCardStyles`
- Loading: **3 skeleton cards** (not 5 — feels faster)
- Error: soft amber banner + Retry (same pattern as profile load error in `LinkedInProfileSetupPanel`)
- No "Generate Content" button in this phase

**Brand tokens (from existing LinkedIn UI):**

| Token | Value |
|-------|-------|
| LinkedIn blue | `#0A66C2` |
| Primary text | `#1e293b` |
| Muted text | `#64748b` |
| Card border | `#e2e8f0` |
| Connected green | `#10b981` / `#ecfdf5` |

---

## UI Behaviour Summary

Display recommendations as clean cards when profile is complete.

Each card shows: title, why this fits you, format chip, audience chips, growth impact pill.

Future phases add a "Generate Content" button beneath each card — **do not implement in Phase 6**.

---

# Implementation Roadmap

Phase 6 is delivered in **three implementation steps**. Each step is independently testable.

---

## Step 1 — Backend Service

**Goal:** Cache-first recommendation generation with validation, mirroring Phase 5 module layout.

### 1a — Types, prompt, validator (no LLM)

| Deliverable | Path |
|-------------|------|
| Pydantic models + JSON schema | `topic_recommendation_types.py` |
| System + user prompt | `backend/prompts/linkedin/topic_recommendation_prompt.py` |
| Pure validator | `topic_recommendation_validator.py` |
| Unit tests | `backend/tests/services/integrations/linkedin/test_topic_recommendation_validator.py` |

### 1b — LLM adapter + orchestrator + persistence

| Deliverable | Path |
|-------------|------|
| Injectable LLM call | `topic_recommendation_llm.py` |
| `get_or_generate_topic_recommendations()` | `topic_recommendation_service.py` |
| Repository get/save + hash | extend `profile_repository.py` |
| DB column (if needed) | `topic_recommendations_json`, `recommendations_updated_at` on `linkedin_analysis_context` |
| Unit tests | `test_topic_recommendation_service.py`, `test_topic_recommendation_llm.py` |

**Exit criteria:** Service returns 5 validated recommendations from mocked LLM; cache hit on second call with same intelligence hash.

---

## Step 2 — API Integration

**Goal:** Extend GET /profile without breaking Phases 1–5.

| Deliverable | Path |
|-------------|------|
| Response models | `backend/models/linkedin_social_models.py` |
| Route wiring + query param | `backend/api/linkedin_social_routes.py` |
| Graceful error fields | `recommendations_error` when generation fails |
| Route tests | `backend/tests/api/test_linkedin_profile_route.py` |

**Exit criteria:** Complete profile GET returns `recommendations` + `recommendations_meta`; incomplete profile omits them; LLM failure returns null recommendations + friendly error string without 500 on whole response.

---

## Step 3 — Frontend Component

**Goal:** User-friendly display in the existing profile setup panel.

| Deliverable | Path |
|-------------|------|
| TypeScript types | `frontend/src/api/linkedinSocial.ts` |
| Hook state | extend `frontend/src/hooks/useLinkedInProfileCompletion.ts` |
| Compact profile header | refactor `LinkedInConnectedProfileCard.tsx` |
| Recommendation panel + card | `TopicRecommendations/TopicRecommendationsPanel.tsx`, `TopicRecommendationCard.tsx` |
| Panel integration | `LinkedInProfileSetupPanel.tsx` — render when `isProfileComplete` |

**Exit criteria:** Connected user with complete profile sees compact header + up to 5 recommendation cards; loading skeletons; error + Retry; plain-language labels for impact and format.

---

## Recommended delivery order

```
Step 1a → Step 1b → Step 2 → Step 3
```

Frontend header refactor (Step 3 partial) can ship in parallel with Step 2 if API types are stubbed.

---

# Logging Requirements

Use Loguru. Log prefix: `[TopicRecommendation]`.

```
================================================
[TopicRecommendation]
Starting recommendation generation
================================================
Reading AI Profile Intelligence...
Preparing LLM prompt...
Sending request to LLM...
Recommendations received.
Validating recommendations...
Assigning recommendation IDs...
Five recommendations generated successfully.
```

On cache hit:

```
[TopicRecommendation] Cache hit user_id={} source=cache
```

---

# Testing Checklist

## Complete Profile

Expected: Five personalized recommendations generated and returned on GET /profile.

## Incomplete Profile

Expected: `recommendations` omitted or null; no LLM call.

## AI Response Validation

Expected: Exactly five recommendations after validation; retry once on schema failure.

## Invalid AI Response (after retry)

Expected: `recommendations: null`, `recommendations_error` set; GET /profile still 200 with profile + intelligence.

## Cache Hit

Expected: Second GET with unchanged intelligence returns `recommendations_meta.source = "cache"`.

## `refresh_recommendations=true`

Expected: Bypass cache; regenerate; `source = "generated"`.

## Empty Recommendations

Expected: Validation fails; retry once; then graceful error response.

---

# Success Criteria

Phase 6 is complete when:

✅ Five personalized recommendations are generated from AI Profile Intelligence only  
✅ Every recommendation is relevant to the user's professional profile  
✅ Each recommendation explains why it fits the user  
✅ Recommended content format is provided (Post or Article)  
✅ Target audience is identified  
✅ Estimated growth impact is included  
✅ Stable `id` assigned server-side for each recommendation  
✅ AI response is validated with Pydantic  
✅ Cache-first persistence with intelligence-hash invalidation  
✅ GET /profile extended with `recommendations`, `recommendations_meta`, `recommendations_error`  
✅ Detailed logging implemented  
✅ Graceful exception handling — profile response never blocked  
✅ Frontend: compact profile header + topic recommendation cards in `LinkedInProfileSetupPanel`  
✅ Plain-language UI labels for non-technical users  

---

# End Result of Phase 1 Roadmap

After completing all six phases, ALwrity will be able to:

1. Connect to LinkedIn
2. Fetch the user's profile
3. Build a standardized Profile Context
4. Validate profile completeness
5. Collect only missing information
6. Build an AI understanding of the user's professional identity
7. Recommend five personalized LinkedIn content ideas that help the user grow their professional presence

This completes the first foundational version of ALwrity's LinkedIn AI Brain and prepares the platform for future features such as content generation, publishing, analytics, and growth optimization.
