# Phase 7 — Profile Optimization Recommendation Engine — Implementation Plan

## Document Information

| Field | Value |
|-------|-------|
| **Date** | 2026-06-20 (created) |
| **Last reviewed** | 2026-06-21 (v2.1 — UI-first + LLM reuse) |
| **Status** | **Locked for implementation** |
| **Product plan** | [`LINKEDIN_PROFILE_OPTIMIZATION_RECOMMENDATION_PLAN.md`](./LINKEDIN_PROFILE_OPTIMIZATION_RECOMMENDATION_PLAN.md) |
| **Best practices source** | [`../linkedin-profile-best-practices/LinkedIn_Profile_Enhancement_Report.md`](../linkedin-profile-best-practices/LinkedIn_Profile_Enhancement_Report.md) |
| **Prerequisites** | Phases 1–6 implemented and stable on `main` |
| **Phase 8** | **Out of scope** until Phase 7 E2E passes without errors |
| **Pattern to mirror** | Phase 6 (`topic_recommendation_*` modules) + Phase 5 split |
| **Start here** | **Step 0** — UI shell first, then pipeline split; every step has a manual UI test gate |
| **Testing doc** | [§2 Manual Testing Playbook](#23-manual-testing-playbook-by-step) — use after every merge |

---

## Implementation Status Review (2026-06-21)

Codebase audit against this plan. **Phase 7 has not started.** Phases 1–6 are the foundation.

### Prerequisites — Phases 1–6

| Area | Status | Evidence |
|------|--------|----------|
| Phase 1–4 pipeline | **Done** | `linkedin_social_routes.py` GET `/profile` |
| Phase 5 intelligence | **Done** | `profile_intelligence_service.py`, cache-first |
| Phase 6 topic recommendations | **Done** | `topic_recommendation_*.py`, repository columns |
| Frontend topic UI | **Done** | `TopicRecommendationsPanel`, `useLinkedInProfileCompletion` |
| Phase 7 backend modules | **Not started** | No `profile_optimization_*` files |
| Phase 7 frontend | **Not started** | No `ProfileOptimization/`, no `useLinkedInProfileOptimization` |
| Phase 7 tests | **Not started** | No `backend/tests/` tree yet for LinkedIn |

### Step progress summary

| Step | Title | Status | Notes |
|------|-------|--------|-------|
| **0** | UI shell + pipeline split | **Done (2026-06-21)** | PR-1 ready for manual test |
| **1** | Types + rubric | **Done (2026-06-21)** | Rubric + debug API + UI gap display |
| **2** | Prompt + LLM adapter | **Not started** | |
| **3** | Validator + normalization | **Not started** | |
| **4** | Service + repository persistence | **Not started** | No `profile_optimization_json` column |
| **5** | API route wiring | **Not started** | No `refresh_profile_optimization` param |
| **5** | API + wire hook (loading/error in UI) | **Not started** | Was Steps 5–6; UI wired here |
| **6** | Full optimization cards + polish | **Not started** | Was Step 7 |
| **7** | Batch progression (next 5) | **Not started** | Was Step 8 |
| **8** | Automated tests + full E2E | **Not started** | Was Step 9 |

### Gaps found vs. current runtime (must fix in Step 0)

1. **Backend:** `_load_topic_recommendations_for_response` runs whenever `ai_profile_intelligence` is present on GET `/profile` — cache miss triggers Phase 6 LLM without user action.
2. **Frontend:** No foundation-only load on LinkedIn Writer mount. User must click **Get Topic Ideas**, which calls `runLinkedInTopicAnalysis()` → `getLinkedInProfile(true, true, true)` (full regen).
3. **Frontend:** After profile completion submit, `submitCompletion` auto-runs full topic analysis (Phases 5–6 regen). After Step 0 it should run **foundation only** (Phases 1–5); advisors stay on-demand.
4. **Product UX:** Dual CTAs (**Improve My Profile** + **Get Topic Ideas**) not wired — only topic flow exists today.

---

## Locked Decisions (do not change during implementation)

These were confirmed against the product plan and enhancement report. Implementation must follow them.

| # | Decision | Rationale |
|---|----------|-----------|
| L1 | **Step 0 is mandatory first PR** | UI shell + pipeline split together — never backend-only Step 0 |
| L2 | **Default GET `/profile` runs Phases 1–5 only** | Phase 5 cache-first OK; Phase 6/7 **skipped entirely** unless explicit flags |
| L3 | **Phase 6 runs only when** `refresh_recommendations=true` **or** `include_recommendations=true` | `refresh` = force regen; `include` = serve cache without LLM |
| L4 | **Phase 7 runs only when** `refresh_profile_optimization=true` **or** `include_profile_optimization=true` | Same pattern as Phase 6 |
| L5 | **Recommendations only in Phase 7** | No Unipile profile edits until Phase 8 |
| L6 | **Rubric detects gaps; LLM explains only detected gaps** | Prevents hallucinated profile problems |
| L7 | **First LLM call generates 10–15 items; UI shows 5** | Server backlog; Step 8 serves next 5 without LLM |
| L8 | **Engagement tactics out of scope** | Posting frequency, commenting, hashtags → future content coaching, not Phase 7 cards (per enhancement report §1.10, §2) |
| L9 | **Mirror Phase 6 module layout** | Types → rubric → prompt → LLM → validator → service → API |
| L10 | **Phase 6 behavior unchanged** after Step 0 | Same topic cards, cache, errors — only *when* it runs changes |
| L11 | **No step merges without a manual UI test gate** | Every step must be verifiable in the browser before the next step starts |
| L12 | **Every failure surfaces in UI** | Use structured `analysis_error` (phase, code, user_message) — never silent backend-only failures |
| L13 | **Observability is part of the feature** | Loguru + frontend console logs at step boundaries; grep-friendly prefixes |
| L14 | **Wire Improve My Profile early (Step 0 shell, Step 5 live)** | Button exists from Step 0; shows loading/error/success as backend comes online |
| L15 | **Reuse existing LLM providers — never add a new Gemini client** | Phase 7 uses `gemini_structured_json_response` via thin `profile_optimization_llm.py` adapter (same as Phases 5–6) |

---

## 1. Objective

Build the **Profile Optimization Recommendation Engine (Phase 7)**:

- Reuse **Phases 1–5** as shared foundation (unchanged semantics).
- Keep **Phase 6** (topic recommendations) **unchanged** in behavior — separate button, separate cache.
- Add **Phase 7** on demand via **Improve My Profile** — five profile-fix recommendations per active batch.
- Ground recommendations in **actual profile fields** + **deterministic best-practice gap detection** + Phase 5 intelligence.
- **Recommendations only** — no Unipile profile edits in Phase 7.

### Enhancement report scope (Phase 7 vs. out of scope)

**In scope (profile sections — enhancement report §1.1–§1.9, §2.3):**

- Photo, headline, custom URL, summary, experience, skills, recommendations received, education, certifications, featured, profile completeness / keywords

**Out of scope (engagement — §1.10, §2.1–§2.2, §2.4):**

- Posting frequency, commenting strategy, connection tactics, Creator Mode, newsletter, video content strategy

---

## 2. Implementation Strategy — UI-First, Test Every Step

### Why the old “backend first, UI last” order failed you

When Steps 1–5 ship without UI, you cannot tell if the pipeline works except via logs or Postman. Errors stay invisible until Step 6–7, which makes debugging feel random. **Phase 7 is a user-facing feature — test it like one.**

### New rule: vertical slices, not horizontal layers

**Never merge a step you cannot manually verify in the LinkedIn Writer UI.**

Each step delivers:

1. **Something you can click** (button, CTA, retry)
2. **Something you can see** (loading, success, empty, or error with plain language)
3. **Something you can grep** (backend Loguru + browser console)

Backend-only work (rubric, validator) still happens, but each backend step includes either a **UI touchpoint** or a **dev debug panel** so gaps/errors are visible without reading server logs alone.

### Locked delivery order (v2)

```
Step 0  UI shell + pipeline split + foundation load visible        ← START HERE
Step 1  Types + rubric (+ dev debug: gap count in UI)
Step 2  Prompt + LLM adapter
Step 3  Validator + normalization
Step 4  Service + repository persistence
Step 5  API wiring + hook — Improve My Profile LIVE (cards or error)
Step 6  Full card UX polish (copy, impact pills, expand)
Step 7  Batch progression (mark done, next 5)
Step 8  Automated tests + full E2E hardening
```

**Merge gate:** Step N is done only when [§2.3 Manual Testing Playbook](#23-manual-testing-playbook-by-step) row for Step N passes.

---

### 2.1 Observability & error handling standard (mandatory every step)

Every step must implement **both** backend logs and UI feedback. No exceptions.

#### Backend (Loguru)

| Requirement | Detail |
|-------------|--------|
| **Prefix** | `[LinkedInAnalysis]` phases 1–5; `[TopicRecommendation]` phase 6; `[ProfileOptimization]` phase 7 |
| **Step boundary** | Log `start` and `complete` with `user_id`, `force_regenerate`, counts |
| **Decisions** | Log cache hit/miss, gate skips, hash mismatch, validation retry |
| **Errors** | `logger.exception` with `error_kind` / `validation_code` — never swallow |
| **Never log** | API keys, tokens, full PII |

#### API contract (`analysis_error`)

Every phase failure returns structured error (mirror Phase 6):

| Field | UI use |
|-------|--------|
| `failed_phase` | Which step broke (1–7) |
| `phase_label` | Plain English (“Profile Optimization”) |
| `error_code` | `schema_validation`, `llm_failure`, `missing_intelligence`, etc. |
| `user_message` | Shown in alert — friendly, actionable |
| `debug_message` | Dev console only |

#### Frontend (browser console)

| Prefix | When |
|--------|------|
| `[LinkedInProfileCompletion]` | Foundation load, completion submit |
| `[TopicSuggestion]` | Get Topic Ideas flow |
| `[ProfileOptimization]` | Improve My Profile flow |

Log: user action, request start, response applied (`last_completed_phase`, counts, `hasAnalysisError`).

#### UI states (every advisor panel)

Every panel (`TopicRecommendations`, `ProfileOptimization`) must handle:

| State | User sees |
|-------|-----------|
| `idle` | CTA / intro copy |
| `running` | Skeleton loaders (min 3 cards) |
| `complete` | Content cards |
| `error` | `AnalysisErrorAlert` + **Retry** button |
| `needs_completion` | Profile completion form; advisors disabled |

#### Dev debug strip (optional, dev/staging only)

Small collapsible footer on LinkedIn Writer profile panel showing:

- `last_completed_phase`
- `failed_phase` / `error_code` if any
- Foundation: `is_profile_complete`, intelligence `source`
- Phase 7 (when wired): `optimization_meta.source`, `remaining_in_backlog`

Removes guesswork when something fails mid-pipeline.

---

### 2.2 Manual test gate template

Use this checklist **before marking any step done**:

| # | Check |
|---|-------|
| 1 | **Action** — What did I click? |
| 2 | **UI** — What appeared? (loading → result or error) |
| 3 | **Error message** — If failed, is `user_message` clear (not raw HTTP)? |
| 4 | **Network** — Correct query params? No unexpected Phase 6/7 LLM on plain load? |
| 5 | **Backend logs** — Grep prefix; confirm start/complete or structured error |
| 6 | **Browser console** — Matching frontend log line? |
| 7 | **Regression** — Does the other advisor (topic vs profile) still work? |

---

### 2.3 Manual testing playbook by step

Run this table after **every PR merge**. Do not start the next step until the row passes.

| Step | You click / do | You should see | Network / logs to verify | Pass? |
|------|----------------|----------------|--------------------------|-------|
| **0** | Open LinkedIn Writer (connected) | Foundation loading → profile card; dual CTAs (**Improve My Profile** + **Get Topic Ideas**); foundation status (complete/incomplete) | GET `/profile` — no `refresh_recommendations`; logs: Phases 1–5 only, **no** `[TopicRecommendation] Starting recommendation generation` | ☐ |
| **0** | Click **Get Topic Ideas** | Topic skeleton → 5 topic cards OR structured error + Retry | `include_recommendations=true` or `refresh_recommendations=true`; `[TopicRecommendation]` start/complete | ☐ |
| **0** | Click **Improve My Profile** (shell) | Panel opens; “not ready yet” or disabled state with clear copy (until Step 5) | No Phase 7 LLM yet | ☐ |
| **1** | Click **Improve My Profile** (after rubric wired) | Dev debug shows gap count + top `rule_id`s OR backend-only: rubric unit tests pass | `[ProfileOptimization] rubric detected_gaps count=N` | ☐ |
| **2–3** | (Backend-only — verify via Step 5) | — | LLM/validator unit tests pass | ☐ |
| **4** | (Backend-only — verify via Step 5) | — | Service test: cache hit/miss logs | ☐ |
| **5** | Click **Improve My Profile** | Skeleton → **5 optimization cards** OR friendly error + Retry | `refresh_profile_optimization=true`; `[ProfileOptimization] call_profile_optimization_llm complete`; `[LinkedInAnalysis] Phase 7 complete count=5` | ☐ |
| **5** | (LLM failure test) Invalid/missing `GEMINI_API_KEY` or mock quota error | UI: friendly error, not stack trace; dev strip: `failed_phase=7`, `error_code=quota_or_rate_limit` or `auth` | `[ProfileOptimization] Gemini/provider failure kind=...` | ☐ |
| **5** | Trigger error (e.g. disconnect network mid-request) | Error alert with Retry; no blank screen | `analysis_error.failed_phase=7` in response or mapped client-side | ☐ |
| **6** | Expand card, copy suggested headline | Copy works; impact/effort labels readable | — | ☐ |
| **7** | Mark 2 cards done → Get next 5 | Next batch without full page regen | POST `.../optimization/{id}/complete`; no new LLM log | ☐ |
| **8** | Full E2E (see Step 8 checklist) | All advisors + error paths | Automated tests green | ☐ |

**Daily habit:** Keep browser DevTools open (Network + Console) and backend terminal visible while testing.

---

## 3. Architecture Reference

### Module map (new files — mirror Phase 6)

| File | Responsibility | Status |
|------|----------------|--------|
| `backend/services/integrations/linkedin/profile_optimization_types.py` | Pydantic models, enums, JSON schema export | Not started |
| `backend/services/integrations/linkedin/profile_optimization_rubric.py` | Deterministic gap detection (no LLM) | Not started |
| `backend/prompts/linkedin/profile_optimization_prompt.py` | System/user prompts + best-practice appendix | Not started |
| `backend/services/integrations/linkedin/profile_optimization_llm.py` | Injectable Gemini structured JSON adapter | Not started |
| `backend/services/integrations/linkedin/profile_optimization_validator.py` | Normalize, validate, assign IDs, build stored payload | Not started |
| `backend/services/integrations/linkedin/profile_optimization_service.py` | Cache-first orchestration, gates, batch queue | Not started |

### Files to extend (existing)

| File | Change | Status |
|------|--------|--------|
| `backend/services/integrations/linkedin/profile_repository.py` | Columns + get/save/clear optimization JSON | Not started |
| `backend/api/linkedin_social_routes.py` | Phase 7 loader, query params, pipeline gating (Step 0 + 5) | Partial — Phase 6 only today |
| `backend/models/linkedin_social_models.py` | Response models + `analysis_error` phase 7 mapping | Not started |
| `frontend/src/api/linkedinSocial.ts` | Types, foundation load, `runProfileOptimization` | Partial — topic only today |
| `frontend/src/hooks/useLinkedInProfileCompletion.ts` | Split topic vs foundation load (Step 0) | Not started |
| `frontend/src/hooks/useLinkedInProfileOptimization.ts` | **New** — optimization state machine | Not started |
| `frontend/src/components/LinkedInWriter/components/ProfileOptimization/` | **New** — panel + cards + labels | Not started |

### LLM provider reuse (mandatory — read before Step 2)

ALwrity centralizes all LLM calls in `backend/services/llm_providers/`. **Phase 7 must reuse this stack — do not call `google.genai` directly and do not duplicate provider code.**

#### What exists today

| Layer | File | Purpose | Used by LinkedIn? |
|-------|------|---------|-------------------|
| **Low-level Gemini** | `llm_providers/gemini_provider.py` | `gemini_structured_json_response`, `gemini_text_response` | **Yes** — Phases 5, 6 |
| **Multi-provider router** | `llm_providers/main_text_generation.py` | `llm_text_gen()` — Gemini / HuggingFace / tenant routing, subscription checks | **No** — blog, SEO, persona, etc. |
| **Other modalities** | `main_image_generation.py`, `main_video_generation.py`, … | Images, video, audio | No |
| **Docs** | `llm_providers/README.md` | Schema best practices, troubleshooting | Reference |

#### Which function Phase 7 uses

**Use `gemini_structured_json_response`** — same as Phase 5 (`profile_intelligence_llm.py`) and Phase 6 (`topic_recommendation_llm.py`).

| Parameter | Phase 7 value | Why |
|-----------|---------------|-----|
| `prompt` | User prompt from `build_profile_optimization_user_prompt()` | Profile context + gaps + intelligence |
| `schema` | `profile_optimization_json_schema()` from types module | Flat JSON schema for Gemini (no `$ref`) |
| `system_prompt` | From `profile_optimization_prompt.py` | Profile advisor instructions |
| `temperature` | `0.3` | Consistent structured output (match Phase 6) |
| `max_tokens` | `4096` | 10–15 recommendations fit comfortably |
| `user_id` | ALwrity user ID | Usage tracking in `gemini_provider` |

**Do not use `llm_text_gen()` for Phase 7.** LinkedIn analysis phases intentionally call Gemini directly for predictable JSON schema behavior. `llm_text_gen` adds multi-provider routing that is unnecessary here and harder to test.

#### Required adapter pattern (copy Phase 6 exactly)

```
profile_optimization_types.py     → profile_optimization_json_schema()
profile_optimization_prompt.py    → system + user prompts
profile_optimization_llm.py         → thin wrapper (NEW — only place that imports gemini_provider)
profile_optimization_validator.py → Pydantic validation (no LLM)
profile_optimization_service.py   → orchestration; injects generate_fn for tests
```

**`profile_optimization_llm.py` must:**

1. Default `generate_fn=gemini_structured_json_response` (injectable for unit tests)
2. Define `ProfileOptimizationLLMError` with `error_kind` (`quota_or_rate_limit`, `auth`, `timeout`, `invalid_json`, …)
3. Call `_classify_gemini_error` + `_coerce_llm_dict` (same pattern as `topic_recommendation_llm.py`)
4. Log with `[ProfileOptimization]` prefix — start, complete, provider failure
5. **Never** import `google.genai` or read `GEMINI_API_KEY` directly

**Service layer (`profile_optimization_service.py`):**

```python
generate_fn: ProfileOptimizationGenerateFn = gemini_structured_json_response
```

Pass `generate_fn` through for tests — mock returns fixture dict, no real API call.

#### Error flow: provider → UI

```
gemini_structured_json_response  →  exception or {"error": "..."}
        ↓
profile_optimization_llm.py      →  ProfileOptimizationLLMError(error_kind=...)
        ↓
profile_optimization_service.py  →  re-raise or validation retry
        ↓
linkedin_social_routes.py        →  analysis_error { failed_phase: 7, error_code, user_message }
        ↓
UI AnalysisErrorAlert            →  friendly message + Retry
```

| `error_kind` (LLM adapter) | `error_code` (API) | User sees |
|----------------------------|-------------------|-----------|
| `quota_or_rate_limit` | `quota_or_rate_limit` | “AI service is busy. Try again in a minute.” |
| `auth` | `auth` | “Configuration error. Contact support.” |
| `timeout` | `timeout` | “Request timed out. Please try again.” |
| `invalid_json` | `schema_validation` | “Couldn't parse suggestions. Retry.” |
| `provider_error` | `llm_failure` | “We couldn't load profile suggestions right now.” |

#### Testing LLM without burning API quota

| Method | When |
|--------|------|
| Mock `generate_fn` in unit tests | Steps 2, 3, 4 — always |
| `generate_fn` returns fixture JSON | Service integration tests |
| Real Gemini call | Manual E2E only (Step 5+) — watch logs for `[ProfileOptimization] call_profile_optimization_llm start/complete` |

#### When to use other providers (future features)

| Need | Use | Example |
|------|-----|---------|
| Structured JSON for LinkedIn pipeline | `gemini_structured_json_response` via `*_llm.py` | Phases 5, 6, **7** |
| Free-form text, multi-provider | `llm_text_gen()` | Blog writer, SEO insights |
| Plain Gemini text (no schema) | `gemini_text_response()` | Simple one-off text |
| Images / video | `main_image_generation`, `main_video_generation` | LinkedIn post images |

#### Schema lessons (from `llm_providers/README.md` + Phase 6)

- Keep schema **flat** — enums as string fields, no deep `$ref` nesting
- Export schema from Pydantic via dedicated `profile_optimization_json_schema()` helper
- Low temperature (0.2–0.3) for structured output
- One validation retry in service layer (not in provider)

**Reference implementations:** `profile_intelligence_llm.py`, `topic_recommendation_llm.py`, `llm_providers/README.md`

---

## Step 0 — UI Shell + Pipeline Split

**Status:** Not started  
**Goal:** You can open LinkedIn Writer and **see** what's happening before any Phase 7 backend exists. Phases 1–5 load on open; Phase 6/7 only on button click.

**Order within Step 0:** Build **UI shell first** (same PR), then wire backend pipeline split.

### 0.0 UI shell (do this first in the PR)

**Create:** `ProfileOptimization/` folder (minimal)

| Piece | Purpose |
|-------|---------|
| Dual CTAs on profile card | **Improve My Profile** (primary) + **Get Topic Ideas** (existing) |
| `ProfileOptimizationPanel.tsx` | Shell: idle / skeleton / error states (empty cards OK for now) |
| `ProfileOptimizationIntro.tsx` | Value prop when idle |
| Foundation status line | e.g. “Profile analysis ready” / “Complete your profile first” |
| Dev debug strip (dev only) | `last_completed_phase`, `error_code`, `is_profile_complete` |
| Reuse `AnalysisErrorAlert` | Same error + Retry pattern as topic flow |

**Improve My Profile** in Step 0: opens panel with placeholder (“Profile suggestions will appear here”) or disabled + tooltip until Step 5. User must **see** the button and panel exist.

**Manual test gate:** [Playbook Step 0](#23-manual-testing-playbook-by-step)

### 0.1 Backend — gate Phase 6 behind explicit flags

**Modify:** `backend/api/linkedin_social_routes.py`

| Change | Detail |
|--------|--------|
| Add query params | `include_recommendations: bool = False`, `include_profile_optimization: bool = False` (Phase 7 param wired in Step 5; add stub/skip in Step 0) |
| Default GET `/profile` | Run Phases 1–5; **skip** `_load_topic_recommendations_for_response` unless `refresh_recommendations=true` **or** `include_recommendations=true` |
| Cache vs regen | `include_recommendations=true` → cache-first serve; `refresh_recommendations=true` → force LLM regen |
| Document | Phase 5 may still run cache-first on complete profile (intelligence is foundation for both advisors) |

**Locked behavior:**

- **Phase 5:** Run cache-first when profile complete on every `/profile` (cheap if cached; needed for both advisors).
- **Phase 6:** Run **only** when `refresh_recommendations=true` or `include_recommendations=true`.
- **Phase 7:** Run **only** when `refresh_profile_optimization=true` or `include_profile_optimization=true` (Step 5).

### 0.2 Frontend — split API calls

**Modify:** `frontend/src/api/linkedinSocial.ts`

```typescript
// Foundation only (Phases 1–5) — default on Writer mount
getLinkedInProfileFoundation(refresh?: boolean, refreshIntelligence?: boolean)

// Topic advisor (Phase 6)
runLinkedInTopicAnalysis() → foundation + include_recommendations=true (or refresh on explicit regen)

// Profile advisor (Phase 7) — added in Step 6
runLinkedInProfileOptimization() → foundation + refresh_profile_optimization=true
```

**Modify:** `frontend/src/hooks/useLinkedInProfileCompletion.ts`

- On connect / mount: call foundation load (not full 1–6).
- `runTopicAnalysis`: use narrowed API (Phase 6 only when clicked).
- `submitCompletion`: on profile complete → **foundation load only**; do **not** auto-run topic or optimization advisors.

**Modify:** `LinkedInProfileSetupPanel.tsx` — trigger foundation load on mount when connected.

### 0.3 Acceptance criteria

- [ ] **UI:** Dual CTAs visible; foundation status shown; dev debug strip works in dev
- [ ] **UI:** Improve My Profile opens panel (placeholder OK)
- [ ] Opening LinkedIn Writer runs foundation load (Phases 1–5); backend logs show **no** `[TopicRecommendation] Starting recommendation generation` on plain GET
- [ ] Clicking **Get Topic Ideas** still returns 5 topic recommendations OR structured error + Retry
- [ ] Phases 1–5 data available after foundation load
- [ ] Profile completion submit does not auto-trigger Phase 6 LLM
- [ ] **Manual test gate:** Playbook Step 0 row passes

### 0.4 Estimated scope

~2–4 files backend, ~5–6 files frontend (UI shell included). **No Phase 7 LLM yet.**

---

## Step 1 — Types + Deterministic Rubric

**Status:** Done (2026-06-21)  
**Goal:** Define Phase 7 data shapes and implement best-practice gap detection without LLM.

### 1.1 Create `profile_optimization_types.py`

**Mirror:** `topic_recommendation_types.py`

**Define:**

- `ProfileSection` literal enum (`headline`, `summary`, `profile_photo`, `custom_url`, `experience`, `skills`, `recommendations`, `education`, `certifications`, `featured`, …)
- `OptimizationImpact` = `High` | `Medium` | `Low`
- `OptimizationEffort` = `Low` | `Medium` | `High`
- `DetectedGap` — `section`, `severity`, `rule_id`, `current_snippet`
- `ProfileOptimizationItemPayload` — LLM output fields (no `id`)
- `ProfileOptimizationLLMResponse` — `recommendations: list` min/max **10–15** for backlog generation; active batch slices to 5
- `ProfileOptimizationItem` — with server `id`
- `ProfileOptimizationMeta` — hashes, `schema_version`, `model`, `active_batch_index`, `completed_ids`
- `StoredProfileOptimization` — `meta`, `recommendations` (active 5), `backlog` (remaining)
- `profile_optimization_json_schema()` — flat schema for Gemini (no `$ref` issues)

### 1.2 Create `profile_optimization_rubric.py`

**Pure functions — no LLM, no DB.**

**Input:** `profile_context: dict`, `profile_validation: dict`

**Output:** `list[DetectedGap]` sorted by severity (High → Medium → Low)

**Rules v1 (mapped to enhancement report):**

| `rule_id` | Report § | Condition | Default severity |
|-----------|----------|-----------|------------------|
| `photo_missing` | §1.1 | No avatar URL | High |
| `headline_empty` | §1.2 | Headline blank | High |
| `headline_title_only` | §1.2 | Headline &lt; 40 chars OR title-only pattern | High |
| `headline_underutilized` | §1.2 | Headline &lt; 120 chars (220 max) | Medium |
| `custom_url_missing` | §1.3 | No vanity / custom URL in normalized profile | Medium |
| `summary_empty` | §1.4 | Summary blank | High |
| `summary_too_short` | §1.4 | Summary &lt; 100 chars | High |
| `summary_no_cta` | §1.4 | Summary present but no contact/CTA heuristic | Low |
| `experience_top_role_thin` | §1.5 | Top experience entry missing description | Medium |
| `experience_no_metrics` | §1.5 | Top role description has no numbers/metrics | Low |
| `skills_count_low` | §1.6 | Fewer than 15 skills | Medium |
| `skills_count_suboptimal` | §1.6 | 15–29 skills (target 30–50) | Low |
| `recommendations_missing` | §1.7 | Zero received recommendations | Medium |
| `education_incomplete` | §1.8 | Education entries missing degree or field | Low |
| `certifications_missing` | §1.8 | No certifications when industry suggests credentials | Low |
| `featured_empty` | §1.9 | No featured items | Low |
| `validation_missing_required` | §2.3 | Each key in Phase 3 `missing_fields` | High |
| `validation_missing_optional` | §2.3 | High-value optional fields from Phase 3 | Medium |

**Log:** `[ProfileOptimization] rubric detected_gaps count=N rule_ids=[...]`

### 1.3 Tests

**Create:** `backend/tests/services/integrations/linkedin/test_profile_optimization_rubric.py`

- Fixture profile with title-only headline → gap detected
- Complete strong profile → fewer gaps
- Phase 3 missing fields → corresponding gaps
- Custom URL missing → gap detected

### 1.4 Acceptance criteria

- [ ] Rubric returns deterministic gaps for sample fixtures
- [ ] No imports from LLM or repository layers
- [ ] Unit tests pass
- [ ] **UI touchpoint:** Dev debug strip shows `detected_gaps count` and top 3 `rule_id`s when **Improve My Profile** clicked (or `profile_optimization_debug` in API response, dev only)
- [ ] **Manual test gate:** Playbook Step 1 row passes

---

## Step 2 — Prompt + LLM Adapter

**Status:** Not started  
**Goal:** Gemini structured JSON that turns gaps + profile into ranked recommendations.

### 2.1 Create `prompts/linkedin/profile_optimization_prompt.py`

**System prompt must:**

- State ALwrity is a LinkedIn **profile** advisor (not content advisor)
- Require JSON only; exactly **10–15** recommendations in backlog response
- Each item must reference a `profile_section` from allowed enum
- Must include `current_state_summary` quoting or paraphrasing actual profile data
- Must **only** address gaps present in `detected_gaps` (+ validation missing fields)
- Include condensed best-practice appendix from enhancement report (§1.1–§1.9, §2.3 — not §1.10/§2 engagement)
- Forbid engagement tactics (posting frequency, commenting strategy)

**User prompt builder:**

```python
build_profile_optimization_user_prompt(
    profile_context,
    profile_validation,
    detected_gaps,
    ai_profile_intelligence,
    completed_recommendation_ids=None,
)
```

Serialize compact JSON; strip `meta` from intelligence.

### 2.2 Create `profile_optimization_llm.py`

**Mirror exactly:** `topic_recommendation_llm.py` and `profile_intelligence_llm.py`

**Import (only LLM import allowed in this file):**

```python
from services.llm_providers.gemini_provider import gemini_structured_json_response
```

**Implement:**

- `call_profile_optimization_llm(system_prompt, user_prompt, user_id, generate_fn=gemini_structured_json_response)`
- `ProfileOptimizationGenerateFn` type alias (injectable)
- Constants: `PROFILE_OPTIMIZATION_LLM_TEMPERATURE = 0.3`, `PROFILE_OPTIMIZATION_LLM_MAX_TOKENS = 4096`
- Schema from `profile_optimization_json_schema()` in types module
- `_classify_gemini_error`, `_coerce_llm_dict`, `ProfileOptimizationLLMError` with `error_kind`
- Pass `user_id` to `generate_fn` for usage tracking

**Forbidden in Phase 7 LinkedIn modules:**

- Direct `google.genai` / `genai.Client` usage
- New wrapper around Gemini API
- `llm_text_gen()` for this pipeline
- Reading `GEMINI_API_KEY` outside `llm_providers/`

### 2.3 Tests

**Create:** `backend/tests/services/integrations/linkedin/test_profile_optimization_llm.py`

- Mock `generate_fn` returns valid dict → adapter passes through
- Invalid JSON → raises `ProfileOptimizationLLMError`

### 2.4 Acceptance criteria

- [ ] Prompt includes `detected_gaps` and profile field snippets
- [ ] LLM adapter calls `gemini_structured_json_response` — no direct Gemini SDK
- [ ] LLM adapter callable with mock `generate_fn` (no real API in unit tests)
- [ ] Provider errors map to `ProfileOptimizationLLMError.error_kind`
- [ ] No validator or persistence in this step

---

## Step 3 — Validator + Normalization

**Status:** Not started  
**Goal:** Parse LLM output safely; normalize enums; assign structure for storage.

### 3.1 Create `profile_optimization_validator.py`

**Mirror:** `topic_recommendation_validator.py`

**Functions:**

- `_normalize_profile_section(value)` — map aliases → allowed enum; default with warning
- `_normalize_impact` / `_normalize_effort` — casing + keyword fallback
- `normalize_profile_optimization_raw(raw)` — strip extra keys, normalize items
- `validate_profile_optimization_payload(raw)` — Pydantic + post-checks:
  - Non-empty `issue`, `why_it_matters`, `recommended_action`
  - `current_state_summary` must not be empty
  - `suggested_copy` required for `headline`, `summary` sections
  - Backlog count 10–15 on full generation response
- `build_stored_profile_optimization(payload, *, profile_context_hash, intelligence_hash, model)`
  - Assign UUID per item
  - Split: first 5 → `recommendations`, rest → `backlog`
- `extract_active_recommendations_list(stored)` — for API response
- `ProfileOptimizationValidationError` with `validation_code`

**Validation retry suffix** (orchestrator, Step 4):

```
Previous response failed schema validation. Return valid JSON only...
```

### 3.2 Tests

**Create:** `backend/tests/services/integrations/linkedin/test_profile_optimization_validator.py`

- Valid payload passes
- Wrong count rejected
- Unknown section normalized or rejected per policy
- `normalize` fixes enum casing
- `build_stored` assigns IDs and splits backlog

### 3.3 Acceptance criteria

- [ ] Validator never calls LLM
- [ ] First 5 items become active batch; rest in backlog
- [ ] All validator tests pass

---

## Step 4 — Service + Repository Persistence

**Status:** Not started  
**Goal:** Cache-first orchestration with gates, hash invalidation, and one validation retry.

### 4.1 Extend `profile_repository.py`

**Add columns** to `linkedin_analysis_context` (migration in repository init, mirror topic columns):

| Column | Type |
|--------|------|
| `profile_optimization_json` | TEXT NULL |
| `profile_optimization_updated_at` | TEXT NULL |

**Add methods:**

- `get_profile_optimization(user_id, row=None) -> dict | None`
- `save_profile_optimization(user_id, stored, *, profile_context_hash, intelligence_hash) -> str`
- `_clear_profile_optimization(user_id, ...)` — on profile context hash change (wire into existing invalidation paths)

**Cache valid when:**

- `meta.built_from_profile_context_hash` matches current context hash
- `meta.built_from_intelligence_hash` matches current intelligence hash (if intelligence required)
- Active batch has 1–5 items

### 4.2 Create `profile_optimization_service.py`

**Mirror:** `topic_recommendation_service.py`

**Main entry:**

```python
get_or_generate_profile_optimization(
    user_id,
    profile_context,
    profile_validation,
    ai_profile_intelligence,
    *,
    repository=None,
    force_regenerate=False,
    generate_fn=gemini_structured_json_response,
) -> tuple[list[dict] | None, ProfileOptimizationAcquireMeta]
```

**Flow:**

1. Gate: `is_profile_complete` — else return `None`
2. Gate: `ai_profile_intelligence` present — else return `None` (v1 default)
3. Compute `profile_context_hash`, `intelligence_hash`
4. Cache hit → return active 5 from stored
5. Cache miss:
   - Run `detect_gaps` (rubric)
   - If no gaps → return empty meta + user message “Your profile looks strong” (no LLM)
   - Build user prompt with gaps + context + intelligence
   - LLM call + validation retry
   - Validate + `build_stored_profile_optimization`
   - Persist
6. Return active batch + meta `{ source, profile_optimization_updated_at, remaining_in_backlog }`

**Exceptions:**

- `ProfileOptimizationLLMError`
- `ProfileOptimizationValidationError`
- `ProfileOptimizationError` (persistence)

### 4.3 Tests

**Create:** `backend/tests/services/integrations/linkedin/test_profile_optimization_service.py`

- Incomplete profile → skips LLM
- Cache hit → no second LLM call
- Hash mismatch → regenerates
- Mock LLM → persists and returns 5 items
- No gaps → skips LLM, returns empty friendly result

### 4.4 Acceptance criteria

- [ ] Stored JSON round-trips through repository
- [ ] Cache invalidates on profile context hash change
- [ ] Service tests pass with mocked LLM

---

## Step 5 — API Wiring + Hook (Improve My Profile LIVE)

**Status:** Not started  
**Goal:** **Improve My Profile** returns real data in UI — 5 cards or a clear error. This is the first end-to-end user test of Phase 7.

**Why Step 5 (not later):** Backend Steps 2–4 can ship in the same PR as Step 5, but **do not merge without this UI wiring**. You test here, not after “all backend done.”

### 5.1 Extend `linkedin_social_models.py`

**Add:**

- `ProfileOptimizationResponse` — single recommendation fields
- `ProfileOptimizationMetaResponse` — `source`, `profile_optimization_updated_at`, `active_batch_index`, `remaining_in_backlog`
- Extend `LinkedInProfileAcquireResponse`:
  - `profile_optimization: Optional[List[ProfileOptimizationResponse]]`
  - `profile_optimization_meta: Optional[ProfileOptimizationMetaResponse]`
  - `profile_optimization_error: Optional[str]`
- Extend `ProfileAnalysisErrorResponse` phase labels for phase 7

### 5.2 Extend `linkedin_social_routes.py`

**Add query params:**

```python
refresh_profile_optimization: bool = Query(False, description="Force Phase 7 regeneration")
include_profile_optimization: bool = Query(False, description="Serve cached Phase 7 without LLM")
```

**Add helper:** `_load_profile_optimization_for_response(...)` — mirror `_load_topic_recommendations_for_response`

**Pipeline order (after Phase 5, parallel to Phase 6):**

```
if profile_complete and intelligence present:
    if refresh_profile_optimization or include_profile_optimization:
        run Phase 7 loader
```

**Default GET `/profile`:** do **not** run Phase 7 (same as Phase 6 after Step 0).

**Error mapping:**

- `ProfileOptimizationValidationError` → `analysis_error` with `failed_phase=7`, `error_code=schema_validation`, etc.
- `ProfileOptimizationLLMError` → friendly user message + debug server-side

**Logging:**

```
[LinkedInAnalysis] Phase 7 start user_id=...
[LinkedInAnalysis] Phase 7 complete user_id=... count=...
```

### 5.3 Extend frontend — wire hook to existing UI shell

**Extend:** `linkedinSocial.ts` — types, `runLinkedInProfileOptimization()`, Phase 7 in `_PHASE_LABELS`

**Create:** `useLinkedInProfileOptimization.ts` — state machine wired to `ProfileOptimizationPanel` from Step 0

**Modify:** `LinkedInProfileSetupPanel.tsx` — replace Step 0 placeholder with live hook

Use `longRunningApiClient` for optimization call (LLM timeout).

### 5.4 Tests

**Create:** `backend/tests/api/test_linkedin_profile_route.py`

- Mock service → response includes `profile_optimization` when flag set
- Default GET does not invoke Phase 7 service

### 5.5 Acceptance criteria

- [ ] Click **Improve My Profile** → skeleton → 5 cards OR `AnalysisErrorAlert` + Retry
- [ ] `analysis_error.failed_phase=7` visible in dev debug strip when Phase 7 fails
- [ ] `refresh_profile_optimization=true` returns up to 5 recommendations
- [ ] Plain GET does not run Phase 7
- [ ] Phase 6 behavior unchanged
- [ ] API route tests pass
- [ ] **Manual test gate:** Playbook Step 5 rows pass

---

## Step 6 — Full Card UX Polish

**Status:** Not started  
**Goal:** Production-quality cards — not new backend logic.

### 6.1 Components (extend Step 0 shell)

`frontend/src/components/LinkedInWriter/components/ProfileOptimization/`

| Component | Purpose |
|-----------|---------|
| `ProfileOptimizationPanel.tsx` | Shell: idle / skeleton / cards / error / retry |
| `ProfileOptimizationCard.tsx` | Section badge, issue, expandable why/copy/steps |
| `profileOptimizationLabels.ts` | Map `profile_section`, `impact`, `effort` → plain language |
| `ProfileOptimizationIntro.tsx` | Value prop + CTA when idle |

**UX (mirror Phase 6):**

- 3 skeleton cards while loading
- Impact pills: “High visibility impact” / “Moderate improvement” / “Nice to have”
- Copy-to-clipboard on `suggested_copy`
- Soft error: “We couldn't load profile suggestions right now. Please try again.”

### 6.2 Layout polish

- Expandable why/copy/steps on each card
- Impact pills and section badges
- Copy-to-clipboard on `suggested_copy`

(Dual CTAs and panel wiring done in Step 0/5.)

### 6.3 Acceptance criteria

- [ ] 5 cards render with real profile snippets in `current_state_summary`
- [ ] Copy-to-clipboard works on headline/summary suggestions
- [ ] Loading, error, retry states still work after polish
- [ ] Phase 6 panel unaffected
- [ ] **Manual test gate:** Playbook Step 6 row passes

---

## Step 7 — Batch Progression (Next 5 Recommendations)

**Status:** Not started  
**Goal:** After user completes active batch, serve next 5 from server backlog without redundant LLM.

### 7.1 Backend — advance batch

**Add to service:**

- `advance_profile_optimization_batch(user_id, completed_id)` — move item to `completed_ids`, pop next from `backlog` into active 5
- `get_next_profile_optimization_batch(user_id)` — if active batch all completed/skipped and backlog non-empty, rotate

**Add route:**

```
POST /api/linkedin-social/profile/optimization/{recommendation_id}/complete
Body: { "status": "done" | "skipped" }
```

**Optional:** On `refresh=true` (Phase 1), field-level diff for completed sections — show nudge if profile unchanged

### 7.2 Frontend

- **Mark as done** button on each card → POST complete → refresh meta / next batch
- Banner when all 5 done: **“Get your next 5 recommendations”**
- `remaining_in_backlog` in meta drives CTA visibility

### 7.3 Acceptance criteria

- [ ] Completing 5 items surfaces next 5 from backlog **without** new LLM call
- [ ] When backlog empty and gaps remain, regeneration runs on next explicit refresh
- [ ] Profile hash change invalidates cache and regenerates
- [ ] **Manual test gate:** Playbook Step 7 row passes

---

## Step 8 — Automated Tests + Full E2E Hardening

**Status:** Not started

### 8.1 Test matrix

| Layer | Files |
|-------|-------|
| Rubric | `test_profile_optimization_rubric.py` |
| Validator | `test_profile_optimization_validator.py` |
| LLM adapter | `test_profile_optimization_llm.py` |
| Service | `test_profile_optimization_service.py` |
| Repository | `test_profile_repository_profile_optimization.py` |
| API route | `test_linkedin_profile_route.py` |
| Gemini schema | Extend `test_gemini_schema_conversion.py` for Phase 7 schema |

### 8.2 Hardening checklist

- [ ] Gemini schema uses flat enum fields (lesson from Phase 6)
- [ ] Normalization defaults for enum drift
- [ ] One validation retry on LLM failure
- [ ] Loguru on all service entry/exit/decisions
- [ ] No secrets in logs
- [ ] `analysis_error.failed_phase = 7` surfaces in UI

### 8.3 Manual E2E checklist (full regression)

- [ ] Connect LinkedIn (Unipile)
- [ ] Open LinkedIn Writer → foundation loads (1–5), no Phase 6/7 LLM in network tab
- [ ] **Improve My Profile** → 5 optimization cards with real headline/summary snippets
- [ ] **Get Topic Ideas** → 5 topic cards (unchanged)
- [ ] Mark 2 done → next refresh shows backlog behavior
- [ ] Edit headline on LinkedIn → refresh → hash invalidates → new recommendations
- [ ] Phase 7 error → Retry works; Phase 6 still usable

### 8.4 Phase 7 “done” definition (before Phase 8)

Phase 7 is **complete** when:

1. All Step 8 E2E checks pass reliably in dev/staging
2. Backend unit tests pass for rubric, validator, service, API
3. No regression to Phase 6 topic flow
4. Product sign-off on copy and card UX
5. **Manual testing playbook** — every row checked once on staging

**Only then** start Phase 8 (Unipile apply-from-ALwrity).

---

## 4. Dependency Graph

```
Step 0 (UI shell + pipeline split)         ← START — test in browser immediately
    │
    ├── Step 1 (types + rubric + debug UI)
    │       │
    │       ├── Steps 2–3 (prompt, LLM, validator) — unit tests; E2E verified at Step 5
    │       │
    │       └── Step 4 (service + repo)
    │               │
    │               └── Step 5 (API + hook LIVE in UI)  ← first real Improve My Profile test
    │                       │
    │                       ├── Step 6 (card polish)
    │                       │
    │                       └── Step 7 (batch progression)
    │                               │
    └───────────────────────────────┴── Step 8 (automated tests + E2E)
```

**Rule:** Do not merge Steps 2–4 without planning Step 5 UI wiring in the same PR (or immediately after).

---

## 5. Suggested PR / Merge Sequence

| PR | Steps | Title suggestion | Manual test after merge |
|----|-------|------------------|-------------------------|
| PR-1 | Step 0 | `feat(linkedin): profile advisor UI shell + foundation load; gate Phase 6` | Playbook Step 0 |
| PR-2 | Steps 1–4 | `feat(linkedin): Phase 7 rubric through service (no live LLM in UI yet)` | Playbook Step 1 |
| PR-3 | Step 5 | `feat(linkedin): Improve My Profile live — API + hook + cards or error` | Playbook Step 5 |
| PR-4 | Steps 6–7 | `feat(linkedin): optimization card polish + batch progression` | Playbook Steps 6–7 |
| PR-5 | Step 8 | `test(linkedin): Phase 7 automated tests + E2E hardening` | Playbook Step 8 |

**Prefer PR-3 as the milestone you demo** — first time recommendations appear in UI.

Do not skip Step 0 UI shell.

---

## 6. Out of Scope (Phase 7)

- Unipile `PATCH /users/me/edit` (Phase 8)
- Auto-apply headline/summary from ALwrity
- Content posting / engagement recommendations (enhancement report §1.10, §2.1–§2.4)
- Analytics dashboard integration
- Changes to Phase 6 topic recommendation logic or schema

---

## 7. References

- [`LINKEDIN_PROFILE_OPTIMIZATION_RECOMMENDATION_PLAN.md`](./LINKEDIN_PROFILE_OPTIMIZATION_RECOMMENDATION_PLAN.md) — product spec + Q&A
- [`../linkedin-profile-best-practices/LinkedIn_Profile_Enhancement_Report.md`](../linkedin-profile-best-practices/LinkedIn_Profile_Enhancement_Report.md) — rubric + prompt source
- [`../linkedin-analysis-context/Phase 6 - Personalized Content Recommendation Engine.md`](../linkedin-analysis-context/Phase%206%20-%20Personalized%20Content%20Recommendation%20Engine.md) — pattern reference
- [`../linkedin-analysis-context/Phase 5 → Understand Data.md`](../linkedin-analysis-context/Phase%205%20%E2%86%92%20Understand%20Data.md)
- [`backend/services/llm_providers/README.md`](../../../backend/services/llm_providers/README.md) — structured JSON best practices
- [`backend/services/integrations/linkedin/topic_recommendation_llm.py`](../../../backend/services/integrations/linkedin/topic_recommendation_llm.py) — LLM adapter pattern to copy
- [`backend/services/integrations/linkedin/profile_intelligence_llm.py`](../../../backend/services/integrations/linkedin/profile_intelligence_llm.py) — Phase 5 adapter reference
- [Unipile Edit own profile](https://developer.unipile.com/reference/userscontroller_editaccountownerprofile) — Phase 8 only

---

**Locked (v2).** Begin with **Step 0 UI shell + pipeline split**. Use the [Manual Testing Playbook](#23-manual-testing-playbook-by-step) after every merge — do not start the next step until the current row passes.
