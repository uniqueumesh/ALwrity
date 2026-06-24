# LinkedIn Profile Optimization Recommendation Engine — Product & Implementation Plan

## Document Information

| Field | Value |
|-------|-------|
| **Date** | 2026-06-20 (updated with Q&A + runtime flow) |
| **Status** | Planning — ready for phased implementation |
| **Implementation plan** | [`PHASE_7_IMPLEMENTATION_PLAN.md`](./PHASE_7_IMPLEMENTATION_PLAN.md) |
| **Audience** | Product, engineering, UX |
| **Folder** | `docs/linkedin/linkedin-profile-recommendation-editing/` |
| **Primary goal** | Give connected users **actionable profile optimization recommendations** based on their current LinkedIn profile analysis — separate from content topic suggestions |
| **Prerequisites** | Phases 1–6 of the LinkedIn Analysis Context pipeline (implemented) |
| **Related docs** | `linkedin-profile-best-practices/LinkedIn_Profile_Enhancement_Report.md`, `linkedin-analysis-context/Phase 6 - Personalized Content Recommendation Engine.md`, [Unipile Edit own profile API](https://developer.unipile.com/reference/userscontroller_editaccountownerprofile) |

---

## 1. Executive Summary

ALwrity already helps users decide **what to write** (Phase 6 — five content topic recommendations). The next capability helps users improve **how they appear on LinkedIn** — headline, summary, skills, experience, photo, and other profile elements that drive impressions and discoverability.

**Primary goal:** Provide LinkedIn personal profile optimization recommendations to connected end users, grounded in their current profile analysis status and industry best practices.

**How:** Reuse the existing analysis pipeline foundation (Phases 1–5) and add a **new, parallel recommendation engine** (proposed **Phase 7**) that returns **five high-priority profile improvements at a time**. When the user completes those (or marks them done), the next request surfaces the **next five** until the profile optimization backlog is exhausted or the profile materially changes.

**Important scope boundary for v1:** Phase 7 **recommends** what to change and provides copy-ready suggestions. It does **not** auto-edit LinkedIn via API.

**Phase 8 is deferred:** We will **complete Phase 7 without errors** (recommendations-only, stable E2E) before starting Phase 8 (apply edits from ALwrity via Unipile `PATCH /api/v1/users/me/edit`). Phase 8 is documented for future alignment only — not part of the Phase 7 delivery.

**Phase 6 is unchanged:** Topic recommendations remain a separate advisor; Phase 7 reuses Phases 1–5 only and adds its own LLM step.

---

## 2. Product Vision — Two Advisors, One Brain

After connect + analysis, the LinkedIn Writer should offer **two distinct advisor actions**, not one combined flow:

| Advisor | User question | Trigger | Output |
|---------|---------------|---------|--------|
| **Content Advisor** (Phase 6 — existing) | “What should I post next?” | **Get Topic Ideas** button | 5 content topic recommendations |
| **Profile Advisor** (Phase 7 — new) | “How do I improve my profile?” | **Improve My Profile** button | 5 profile optimization recommendations |

### UX principle

Users should never wonder which button to press. Use plain language, separate panels, and separate loading/error states.

```
┌─────────────────────────────────────────────────────────────┐
│  LinkedIn Writer — Connected Profile                         │
├─────────────────────────────────────────────────────────────┤
│  [ Improve My Profile ]     [ Get Topic Ideas ]              │
│       ↓                            ↓                         │
│  ProfileOptimizationPanel    TopicRecommendationsPanel       │
│  (5 profile fixes)           (5 content ideas)               │
└─────────────────────────────────────────────────────────────┘
```

Both buttons may share the **same underlying pipeline run** (Phases 1–5) when analysis is stale, but each advisor triggers **its own LLM phase** on demand — not on every page load.

---

## 3. Relationship to Existing Pipeline (Phases 1–6)

### What we keep unchanged

| Phase | Role | Change for Phase 7 |
|-------|------|-------------------|
| 1 | Acquire normalized profile (Unipile) | None |
| 2 | Build `profile_context` | None |
| 3 | Validate completeness + missing fields | **Becomes a primary signal for Phase 7 priority** |
| 4 | Adaptive completion Q&A | None |
| 5 | AI Profile Intelligence | **Secondary signal** (goals, positioning, audience) |
| 6 | Content topic recommendations | **Unchanged** — separate button, separate cache |

### What we add (proposed Phase 7)

```
Phases 1–5 (shared foundation)
        │
        ├──────────────────────────┐
        ▼                          ▼
   Phase 6                    Phase 7
   Topic Recommendations      Profile Optimization Recommendations
   (content ideas)            (profile edit guidance)
```

### Senior recommendation: do not fold Phase 7 into Phase 6

Your instinct to reuse the pipeline is correct; your instinct to **replace** the Phase 6 output is not needed — keep both. Running two LLM calls inside one GET `/profile` would slow the default load and blur product semantics. Instead:

- Run Phases 1–5 when the user opens LinkedIn Writer or clicks either advisor button (if stale).
- Run Phase 6 **only** when user clicks **Get Topic Ideas**.
- Run Phase 7 **only** when user clicks **Improve My Profile**.

---

## 3.1 Runtime Flow — Simple Explanation (Q&A)

This section captures the agreed product flow in plain terms.

### Mental model — three speeds, not one big request

```
User opens LinkedIn Writer
        │
        ▼
   Phases 1–5  (foundation — fast when cached)
   • Fetch profile from Unipile
   • Build clean profile_context
   • Check if profile is complete
   • Show completion questions if needed
   • Build AI Profile Intelligence (“who is this person?”)
        │
        ├─────────────────────┬─────────────────────┐
        ▼                     ▼                     ▼
  User browses UI        Clicks                  Clicks
  (no extra LLM)        "Get Topic Ideas"       "Improve My Profile"
                              │                         │
                              ▼                         ▼
                         Phase 6 only              Phase 7 only
                         (5 content topics)        (5 profile fixes)
```

### What runs when

| When | What runs | LLM? | User-facing purpose |
|------|-----------|------|---------------------|
| **Open LinkedIn Writer** | Phases 1–5 | Phase 5 only if not cached | Prepare profile + “brain” |
| **Get Topic Ideas** | Phase 6 (after 1–5 if stale) | Yes, if not cached | “What should I write?” |
| **Improve My Profile** | Phase 7 (after 1–5 if stale) | Yes, if not cached | “What should I fix on my profile?” |

Phases 1–4 are **not AI** (fetch, normalize, validate, completion Q&A). Phase 5 is **one AI call** to understand the user. Phases 6 and 7 are **separate on-demand AI calls**, each tied to its own button.

### Technical control — one endpoint, query flags

Use **`GET /api/linkedin-social/profile`** with flags (same pattern as Phase 6):

| Client call | Query params | Backend runs |
|-------------|--------------|--------------|
| Page open / light refresh | none | Phases 1–5 only; **skip** Phase 6 and Phase 7 LLM |
| Get Topic Ideas | `refresh_recommendations=true` (+ refresh 1–5 if stale) | Phases 1–5 + **Phase 6** |
| Improve My Profile | `refresh_profile_optimization=true` (+ refresh 1–5 if stale) | Phases 1–5 + **Phase 7** |

Backend rules:

1. **Always** run Phases 1–5 when loading profile (cache-first — no Unipile/Gemini if data is fresh).
2. Run **Phase 6** only when the client requests topic recommendations.
3. Run **Phase 7** only when the client requests profile optimization.

### Current vs target behavior

| Area | Today (pre–Phase 7 split) | Target (Phase 7 + pipeline split) |
|------|---------------------------|-------------------------------------|
| Topic Suggestion button | `runLinkedInTopicAnalysis()` → `refresh=true, refresh_intelligence=true, refresh_recommendations=true` (Phases 1–6 together) | **Get Topic Ideas** → Phases 1–5 (if stale) + Phase 6 only |
| Page open | May not run full pipeline until user clicks | **On connect/open** → Phases 1–5 to warm cache |
| Profile optimization | Not implemented | **Improve My Profile** → Phases 1–5 (if stale) + Phase 7 only |

Implementing the pipeline split is **Step 0** in [`PHASE_7_IMPLEMENTATION_PLAN.md`](./PHASE_7_IMPLEMENTATION_PLAN.md) — a prerequisite refactor, not a replacement of Phase 6.

### Why this design

- Opening LinkedIn Writer stays **fast** (no topic + optimization LLM unless the user asks).
- Each button has a **clear job** — no confusion between “write content” vs “fix profile”.
- Phase 6 and Phase 7 can **fail independently** without breaking the other.

### One-sentence summary

**Open LinkedIn Writer → build the foundation (Phases 1–5). Click “Get Topic Ideas” → add Phase 6. Click “Improve My Profile” → compare profile to best practices, then Phase 7 turns top gaps into 5 fix recommendations.**

---

## 3.2 Two-Layer Intelligence — Best Practices vs Profile Comparison (Q&A)

**Phase 5 does not compare against LinkedIn best practices.** Phase 5 answers: *“Who is this professional?”* (expertise, audience, positioning). It does **not** score the profile against optimization rules.

Phase 7 uses **two layers**:

### Layer 1 — Rules engine (no AI) — “Compare profile vs best practices”

Before any Phase 7 LLM call, run a **deterministic checklist** against `profile_context` + `profile_validation`, using rules from [`LinkedIn_Profile_Enhancement_Report.md`](../linkedin-profile-best-practices/LinkedIn_Profile_Enhancement_Report.md):

| Best practice | Simple check on real profile data |
|---------------|-----------------------------------|
| Profile photo | Is `avatar_url` missing or default? |
| Headline | Short, title-only, or missing keywords? |
| Summary | Empty or very short? |
| Skills | Fewer than threshold count? |
| Experience | Top role lacks metrics or description? |
| Completeness | Phase 3 `missing_fields` + `optional_missing_fields` |

Example output fed into the LLM:

```json
{
  "detected_gaps": [
    { "section": "headline", "severity": "high", "rule": "headline_title_only" },
    { "section": "summary", "severity": "high", "rule": "summary_too_short" },
    { "section": "skills", "severity": "medium", "rule": "skills_count_low" }
  ],
  "completeness_score": 72
}
```

This is the **objective comparison step** — repeatable and grounded in actual fields.

### Layer 2 — LLM (Phase 7) — “Turn gaps into 5 actionable recommendations”

The LLM receives:

1. **`profile_context`** — what the profile actually says today  
2. **`detected_gaps`** — what failed the best-practice rules (LLM must not invent new gaps)  
3. **`ai_profile_intelligence`** (Phase 5) — goals, audience, positioning  
4. **Best-practice appendix** — condensed rules from the enhancement report in the system prompt  

The LLM:

- Picks the **top 5** gaps by severity  
- Writes **why it matters** (from best practices)  
- Suggests **concrete copy** (e.g. a better headline)  
- Names which **profile section** to edit  

**Summary:** Rules **compare**; LLM **explains and recommends**. Phase 5 is not replaced — Phase 7 adds an optimization layer on top of Phases 1–5.

---

## 3.3 Grounding in Actual Profile & Best Practices (Q&A)

### Grounded in actual profile

Phase 7 reads **real field values** from Phase 2 (`profile_context`), for example:

- Current headline text  
- Current summary / About text  
- Experience entries  
- Skills list  
- Photo URL presence  
- Phase 3 missing and optional fields  

Each recommendation includes:

- **`current_state_summary`** — e.g. “Your headline is: Software Engineer at Acme”  
- **`recommended_action`** — what to change  
- **`suggested_copy`** — example text (copy-to-clipboard in UI)  

| Engine | Primary input | Question answered |
|--------|---------------|-------------------|
| Phase 6 | Phase 5 intelligence only | “What should I write?” |
| Phase 7 | `profile_context` + gaps + Phase 5 | “What should I fix on my profile?” |

### LinkedIn best practices — yes, explicitly

Best practices come from the enhancement report in **two ways**:

1. **Rules engine (`profile_optimization_rubric.py`)** — encodes report sections (§1.1 photo, §1.2 headline, §1.4 summary, etc.) as deterministic checks  
2. **LLM prompt appendix** — condensed guidance so suggestions follow LinkedIn norms (keywords, headline format, summary length, CTA, etc.)

### What is out of Phase 7 scope (engagement, not profile editing)

These items from the enhancement report belong in **content/engagement coaching** (future), **not** Phase 7 cards:

- Posting frequency (2–3× per week)  
- Commenting / connection tactics  
- Hashtag strategy on posts  
- Newsletter / Creator Mode enablement (optional low-priority card in v2 only)

Phase 6 continues to address **what to write**; Phase 7 addresses **editable profile sections** only.

---

## 4. Inputs — Richer Than Phase 6 Alone

Phase 6 intentionally reads **only** `AIProfileIntelligence`. Phase 7 should be **more grounded in the actual profile** because optimization is about concrete fields (headline text, summary length, skills count, photo presence).

### Recommended LLM input bundle

| Input | Source | Why |
|-------|--------|-----|
| `profile_context` | Phase 2 | Current field values (headline, summary, experience, skills, etc.) |
| `profile_validation` | Phase 3 | Missing required/optional fields, completeness score |
| `ai_profile_intelligence` | Phase 5 | User’s stated positioning, audience, expertise, goals |
| `optimization_rubric` | Static prompt appendix | Best-practice rules from enhancement report (§1–§2.3) |
| `completed_recommendation_ids` | Phase 7 persistence | Exclude or deprioritize already addressed items |
| `user_linkedin_goal` (optional) | Onboarding or Phase 4 | e.g. job search, thought leadership, client acquisition |

### Senior recommendation

Add a **deterministic pre-scoring step** (no LLM) before the LLM call: a rules engine that flags obvious gaps (no photo URL, headline &lt; 40 chars, &lt; 10 skills, empty summary). Feed those flags into the prompt as `detected_gaps[]`. This improves consistency and reduces hallucinated “problems.”

---

## 5. Output — Profile Optimization Recommendation Schema

Return **exactly five** recommendations per request, ranked by **criticality** (highest impact first).

### Proposed recommendation object

```json
{
  "id": "uuid",
  "priority_rank": 1,
  "profile_section": "headline",
  "issue": "Headline reads like a job title only",
  "why_it_matters": "Headlines appear in search and connection requests; keyword-rich headlines improve discoverability.",
  "current_state_summary": "Software Engineer at Acme Corp",
  "recommended_action": "Rewrite headline using Role | Value | Industry format with target keywords.",
  "suggested_copy": "Software Engineer | Building scalable fintech platforms | Python & Cloud | Helping teams ship faster",
  "effort": "Low",
  "impact": "High",
  "best_practice_ref": "Enhancement Report §1.2",
  "completion_criteria": "Headline updated to include value proposition and at least 2 searchable keywords",
  "can_apply_via_unipile": true,
  "unipile_field_hint": "headline"
}
```

### Allowed `profile_section` values (v1)

Align with what we can **read** from Unipile profile context and eventually **write** via [Unipile Edit own profile](https://developer.unipile.com/reference/userscontroller_editaccountownerprofile):

| Section | Read (Phase 1) | Write (Phase 8 / Unipile) |
|---------|----------------|---------------------------|
| `profile_photo` | ✓ | ✓ (`picture`) |
| `headline` | ✓ | ✓ |
| `summary` | ✓ | ✓ |
| `custom_url` | Partial | Manual (user action on LinkedIn) |
| `experience` | ✓ | ✓ (nested fields) |
| `skills` | ✓ | Limited / manual guidance |
| `education` | ✓ | Guidance only in v1 |
| `featured` | Partial | Guidance only in v1 |
| `recommendations` | Partial | Guidance only (social proof — not API write in v1) |
| `creator_mode` | ✗ | Guidance only |

### Fields to exclude from Phase 7 v1 (content strategy, not profile editing)

From the enhancement report, these belong in **content/engagement coaching** (future Phase 9 or in-app tips), **not** profile optimization cards:

- Posting frequency (2–3× per week)
- Commenting tactics
- Connection invitation strategy
- Hashtag usage on posts
- Newsletter / Creator Mode enablement (can be a low-priority “consider enabling” card in v2)

Keeping Phase 7 focused on **editable profile assets** makes the UX actionable and measurable.

---

## 6. Batching Logic — Five at a Time, Then Next Five

Your requirement: *“Give 5 critical recommendations at once; when finished, next request gives the next 5.”*

### Recommended batching model

```
┌─────────────────────────────────────────────────────────────┐
│  Master backlog (ranked by impact × gap severity)            │
│  [R1][R2][R3][R4][R5][R6][R7]...[Rn]                        │
└─────────────────────────────────────────────────────────────┘
        │
        ▼  First request
   Active batch: R1–R5
        │
        ▼  User marks items done OR profile hash changes on section
   Active batch: R6–R10 (skip completed / invalidated)
```

### Completion detection (pick one primary + one fallback)

| Method | Pros | Cons |
|--------|------|------|
| **User marks “Done”** | Simple, honest UX | User may mark done without editing |
| **Profile re-fetch detects change** | Objective | Requires refresh; Unipile lag |
| **Hybrid (recommended)** | Best trust | Slightly more UI |

**Hybrid flow:**

1. User clicks **Mark as done** on a card.
2. On next **Improve My Profile** refresh, Phase 1 re-fetch compares `profile_content_hash` + field-level diff for that section.
3. If unchanged, show gentle nudge: “We don’t see an update yet — keep this recommendation active?”

### Persistence

Store in `linkedin_analysis_context` (new columns, mirror Phase 6 pattern):

| Column | Purpose |
|--------|---------|
| `profile_optimization_json` | Full stored payload with meta + all batches |
| `profile_optimization_updated_at` | Cache timestamp |
| `built_from_profile_context_hash` | Invalidate when profile changes |

Meta block:

```json
{
  "meta": {
    "built_from_profile_context_hash": "...",
    "built_from_intelligence_hash": "...",
    "schema_version": 1,
    "model": "gemini-2.5-flash",
    "active_batch_index": 0,
    "total_generated": 12,
    "completed_ids": ["uuid-1", "uuid-2"]
  },
  "recommendations": [ /* current active batch of 5 */ ],
  "backlog": [ /* optional server-side queue for next batches */ ]
}
```

### Senior recommendation: server owns the backlog queue

Do not ask the LLM to “remember” prior batches. On first generation, produce **10–15 ranked items** in one structured call (or two calls), persist the full queue server-side, and **serve five at a time** from that queue. Subsequent “next batch” requests are cheap (no LLM) until the queue is empty or profile hash changes.

If the queue is empty and profile still has gaps, run LLM again with `completed_recommendation_ids` + updated context.

---

## 7. Best-Practice Rubric (from Enhancement Report)

Map report sections to scorable profile checks. Use as **deterministic rules** + **LLM narrative**.

| Report section | Detection heuristic (Phase 7 pre-score) | Typical recommendation |
|----------------|----------------------------------------|------------------------|
| §1.1 Profile photo | Missing or default avatar URL | Add professional headshot |
| §1.2 Headline | Short, title-only, no keywords | Rewrite with value + keywords |
| §1.3 Custom URL | Not in normalized profile | Claim vanity URL (manual step) |
| §1.4 Summary | Empty or &lt; 100 chars | Expand About with story + CTA |
| §1.5 Experience | Bullets missing metrics | Quantify impact in top role |
| §1.6 Skills | &lt; 15 skills listed | Add relevant skills to 30–50 |
| §1.7 Recommendations | Zero recommendations | Request 2–3 from colleagues |
| §1.8 Education | Incomplete entries | Fill degree / certifications |
| §1.9 Featured | Empty featured section | Pin best post or article |
| §2.3 Search keywords | Keywords only in one section | Distribute keywords across headline + summary + experience |

Impact labels for UI (same pattern as Phase 6 growth pills):

| Backend | User-facing |
|---------|-------------|
| `High` | “High visibility impact” |
| `Medium` | “Moderate improvement” |
| `Low` | “Nice to have” |

---

## 8. UI/UX Design Plan

### 8.1 Entry points

- **Primary CTA:** `Improve My Profile` — secondary visual weight to `Get Topic Ideas` (both visible; neither hidden behind the other).
- Place both CTAs below the connected profile card once Phases 1–3 succeed.
- If profile incomplete (Phase 3), disable **both** advisors and show Phase 4 completion first (same gate as Phase 6).

### 8.2 ProfileOptimizationPanel (new)

Mirror `TopicRecommendationsPanel` patterns for consistency:

| State | UI |
|-------|-----|
| Idle | CTA + one-line value prop: “Get 5 priority fixes for your LinkedIn profile” |
| Loading | 3 skeleton cards (not 5 — calmer) |
| Success | Up to 5 `ProfileOptimizationCard` components |
| Error | Soft message + Retry (reuse `AnalysisErrorAlert` pattern) |
| Batch complete | Banner: “Great progress — get your next 5 recommendations” |

### 8.3 ProfileOptimizationCard

Progressive disclosure (learned from Phase 6):

```
┌──────────────────────────────────────────────┐
│  [High impact]  Headline                      │
│  Issue: Title-only headline                   │
│  ─────────────────────────────────────────── │
│  ▼ Why this matters (collapsed)               │
│  ▼ Suggested copy (expand to copy-to-clipboard) │
│  ▼ How to apply on LinkedIn (steps)           │
│  [ Mark as done ]  [ Copy suggestion ]        │
└──────────────────────────────────────────────┘
```

### 8.4 Copy & tone

- Second person (“your headline”, “your profile”).
- No jargon (`profile_section` → “Headline”, “About section”).
- Every card ends with a **single clear next action**.

### 8.5 Accessibility & mobile

- Copy buttons with screen-reader labels.
- Cards stack vertically; impact badge not color-only (icon + text).

---

## 9. API Design Sketch

Extend existing routes — **do not** create a parallel pipeline endpoint unless necessary.

### Option A (recommended): extend `GET /api/linkedin-social/profile`

New query param: `refresh_profile_optimization=true`

New response fields:

```json
{
  "profile_optimization": [ /* 5 items */ ],
  "profile_optimization_meta": {
    "source": "cache | generated",
    "profile_optimization_updated_at": "...",
    "active_batch_index": 0,
    "remaining_in_backlog": 7
  },
  "profile_optimization_error": null,
  "analysis_error": null
}
```

### Option B: dedicated endpoint

`GET /api/linkedin-social/profile/optimization` — cleaner separation if Phase 7 logic grows large.

**Recommendation:** Start with Option A for consistency with Phase 6; split to Option B if the route file exceeds maintainability thresholds.

### Mark completion

`POST /api/linkedin-social/profile/optimization/{id}/complete`

Body: `{ "status": "done" | "skipped" }`

Triggers backlog advance on next fetch.

---

## 10. Backend Module Plan (mirrors Phase 6)

| Module | Responsibility |
|--------|----------------|
| `profile_optimization_types.py` | Pydantic models + JSON schema |
| `profile_optimization_rubric.py` | Deterministic gap detection (no LLM) |
| `profile_optimization_prompt.py` | System/user prompts + enhancement report appendix |
| `profile_optimization_llm.py` | Gemini structured JSON adapter |
| `profile_optimization_validator.py` | Normalize + validate + assign IDs |
| `profile_optimization_service.py` | Cache-first orchestration, batch queue, gates |
| `profile_repository.py` (extend) | Persist `profile_optimization_json` |

### Gates (same as Phase 6)

```
profile_validation.is_profile_complete === true
AND profile_context is present
AND (optionally) ai_profile_intelligence is present
```

**Senior recommendation:** Require Phase 5 intelligence for richer “why it matters” copy tied to user goals, but allow a **degraded mode** using only `profile_context` + validation if intelligence is missing.

---

## 11. Phase 8 (Future) — Apply Edits via Unipile

**Not part of Phase 7 delivery.** Ship and stabilize Phase 7 first; start Phase 8 only after Phase 7 E2E passes without errors.

Document now to align architecture only.

Unipile exposes [`PATCH /api/v1/users/me/edit`](https://developer.unipile.com/reference/userscontroller_editaccountownerprofile) for fields such as `headline`, `summary`, and `picture` (nested bracket notation for complex fields).

### Future UX

On cards where `can_apply_via_unipile === true`:

```
[ Apply this change ]  →  preview modal  →  confirm  →  Unipile PATCH
```

### Risks to plan for

- LinkedIn account permission / subscription errors (`403 feature_not_subscribed`)
- Rate limits (`429`)
- User trust — always preview before write
- Field-level validation on Unipile side (`422`)

Keep Phase 7 **read-only recommendations** so product value ships before write integration.

---

## 12. Implementation Roadmap

Detailed step-by-step tasks, file lists, and acceptance criteria live in **[`PHASE_7_IMPLEMENTATION_PLAN.md`](./PHASE_7_IMPLEMENTATION_PLAN.md)**.

### Milestone summary

| Milestone | Scope | Deliverable |
|-----------|--------|-------------|
| **0** | Planning | This document + implementation plan (done) |
| **1** | Pipeline split | Phases 1–5 on open; Phase 6 / 7 on demand |
| **2** | Phase 7 backend core | Rubric + LLM + validator + service + API |
| **3** | Phase 7 frontend | Improve My Profile UI + hook |
| **4** | Batch progression | Mark done, backlog, next 5 |
| **5** | Hardening | Tests, error UX, cache invalidation |
| **Future** | Phase 8 | Unipile apply-from-ALwrity (after Phase 7 stable) |

---

## 13. Success Metrics

| Metric | Target |
|--------|--------|
| Profile optimization click-through | ≥ 30% of connected users try it within 7 days |
| Card completion rate | ≥ 2 of 5 marked done per session |
| Profile field change rate | ≥ 1 field updated within 14 days (hash diff) |
| Time to first recommendation | &lt; 15s P95 (cached Phases 1–5) |
| LLM validation success | ≥ 95% first-or-retry pass (same bar as Phase 6) |

---

## 14. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| LLM suggests changes not grounded in real profile | Rubric pre-scorer + include current field text in prompt |
| Overlap with Phase 6 topics | Strict scope: Phase 7 = profile fields only |
| User overwhelmed by two advisors | Clear CTAs, separate panels, progressive disclosure |
| Stale recommendations after user edits LinkedIn outside ALwrity | Invalidate on `profile_content_hash` change |
| Unipile write scope creep in v1 | Defer apply to Phase 8; v1 is recommend-only |

---

## 15. Open Questions & Proposed Defaults (decide at Step 1 kickoff)

| # | Question | Proposed default for v1 |
|---|----------|-------------------------|
| 1 | User goal capture before first batch? | Defer — infer from Phase 5 intelligence |
| 2 | Batch size | Fixed at **5** (matches Phase 6 UX) |
| 3 | Hard-gate Phase 7 on Phase 5? | **Yes** — require intelligence for richer copy; skip Phase 7 if Phase 5 failed |
| 4 | Backlog generation | **Single LLM call for 10–15 items**; serve 5 at a time from server queue |
| 5 | Industry templates | Use Phase 5 `industry` field in prompt; no separate template library in v1 |

---

## 16. Summary — Your Plan vs Recommended Plan

| Your idea | Recommendation |
|-----------|----------------|
| Reuse analysis pipeline | ✅ Yes — Phases 1–5 shared; Phase 6 unchanged |
| Separate button for profile optimization | ✅ Yes — **Improve My Profile** alongside **Get Topic Ideas** |
| 5 recommendations at a time | ✅ Yes — with **server-side ranked backlog** |
| Next 5 after finishing | ✅ Yes — hybrid **Mark done** + profile hash verification |
| Use enhancement report | ✅ Yes — as deterministic rubric + prompt appendix |
| Same endpoint flow as topics | ⚠️ Same **foundation**, separate **Phase 7 LLM** on demand |
| Utilize Unipile edit API immediately | ⏳ Phase 8 — ship recommendations first (lower risk, faster value) |

---

## 17. References

- Internal: `docs/linkedin/linkedin-profile-best-practices/LinkedIn_Profile_Enhancement_Report.md`
- Internal: `docs/linkedin/linkedin-analysis-context/` (Phases 1–6)
- Internal: `docs/linkedin/unipile/PULL_REQUEST_TEMPLATE.md`
- External: [Unipile — Edit own profile](https://developer.unipile.com/reference/userscontroller_editaccountownerprofile)
- External: [Unipile — Retrieving Users](https://developer.unipile.com/docs/retrieving-users)

---

**Next step:** Follow [`PHASE_7_IMPLEMENTATION_PLAN.md`](./PHASE_7_IMPLEMENTATION_PLAN.md) starting with **Step 0** (pipeline split), then **Steps 1–7** (Phase 7 backend + frontend MVP). Phase 8 starts only after Phase 7 E2E is stable.
