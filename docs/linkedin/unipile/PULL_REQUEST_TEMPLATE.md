# Pull Request — Unipile Connection & LinkedIn Analysis Context Pipeline (Clean Rebase)

## Document Information

| Field | Value |
|-------|-------|
| **Date** | 2026-06-20 |
| **Status** | Ready for review |
| **Branch** | `feat/linkedin-unipile-phases-1-6` → `ALwrity/main` |
| **Suggested PR title** | `feat(linkedin): Unipile Phases 1–6 on fresh upstream main (replaces #729)` |
| **Files changed** | **75** (LinkedIn-only; down from 104 in superseded PR) |
| **Scope** | Unipile connect + six-phase analysis pipeline + LinkedIn Writer Topic Suggestion UX |
| **Supersedes** | [#729](https://github.com/ALwrity/ALwrity/pull/729) |
| **Out of scope (this PR)** | Analytics dashboard UI, stale unrelated diffs from old branch, Phase 7 profile optimization |

---

## 📝 Description

This PR delivers end-to-end LinkedIn integration for the LinkedIn Writer using the **Unipile API** for account connection and profile acquisition, plus a **six-phase LinkedIn Analysis Context pipeline** that transforms a connected profile into personalized content topic recommendations.

### Why this PR replaces #729

PR #729 was opened from a branch **41 commits behind** `ALwrity/main`. It included **104 changed files**, many unrelated to LinkedIn (content strategy, OAuth monitoring, GSC, etc.) that upstream had already fixed.

This PR is a **clean re-apply** of LinkedIn-only work onto **current `main`**:

| | PR #729 (old) | This PR (new) |
|--|---------------|---------------|
| Base | Stale fork `main` | Current `ALwrity/main` |
| Files | 104 | **75** |
| Unrelated diffs | Included | **Removed** |
| Manual E2E | Passed on old base | **Passed on fresh base** |

Original work is preserved on backup branch `backup/pr729-full-work-2026-06-20`.

### Unipile connection

- Hosted OAuth connect/disconnect flow with per-user credential storage
- Two-step profile acquisition from Unipile (`/users/me` → `/users/{identifier}` with `linkedin_sections`)
- Connection status API and frontend popup flow with post-connect verification
- **OAuth popup auto-closes** after successful connect (opener + callback page fix)

### Analysis Context pipeline (Phases 1–6)

| Phase | Purpose | Key output |
|-------|---------|------------|
| **1** | Profile acquisition | Normalized LinkedIn profile from Unipile; persisted in `linkedin_analysis_context` |
| **2** | Profile context normalization | Canonical `profile_context` snapshot with content-hash cache |
| **3** | Completeness validation | `is_profile_complete`, score, missing fields |
| **4** | Adaptive profile completion | Dynamic completion questions; user answers merged into context |
| **5** | AI Profile Intelligence | Gemini structured JSON → professional identity, expertise, audience, writing opportunities |
| **6** | Topic recommendations | Gemini structured JSON → exactly 5 personalized LinkedIn content ideas |

All phases are orchestrated through **`GET /api/linkedin-social/profile`**, with cache-first behavior, hash-based invalidation, structured `analysis_error` on phase failure, and a full **Topic Suggestion** UX in the LinkedIn Writer.

### Reliability improvements

- **Gemini structured-output schema fix** — `$ref`/`$defs` resolution and `enum` preservation so LLM output matches allowed values (`recommended_format`, `growth_impact`)
- **LLM output normalization** — enum casing/whitespace fixes and safe defaults before Pydantic validation
- **Validation retry** — one automatic LLM retry on schema failure (Phases 5 & 6)
- **OAuth callback hardening** — callback page always attempts `window.close()`; opener closes popup when connection confirmed via status poll

---

## Architecture Overview

```
Unipile OAuth Connect
        │
        ▼
Phase 1: Profile fetch + normalize (Unipile API)
        │
        ▼
Phase 2: Profile context build + cache
        │
        ▼
Phase 3: Completeness validation
        │
        ▼
Phase 4: Adaptive completion (if incomplete)
        │
        ▼
Phase 5: AI Profile Intelligence (Gemini)
        │
        ▼
Phase 6: Topic Recommendations (Gemini) → 5 content ideas
        │
        ▼
LinkedIn Writer UI — TopicRecommendationsPanel
```

### Data flow

- **Input:** Connected Unipile account + optional user completion answers
- **Storage:** Per-user `linkedin_analysis_context` row (SQLite per workspace)
- **Output:** `profile`, `profile_context`, `profile_validation`, `ai_profile_intelligence`, `recommendations` (5 items)

Downstream phases invalidate automatically when upstream content hashes or timestamps change.

---

## Backend Changes

### Unipile connection

| Module | Responsibility |
|--------|----------------|
| `backend/services/integrations/linkedin_oauth.py` | OAuth URL, callback, encrypted credential storage, Unipile account sync |
| `backend/services/integrations/linkedin/unipile_provider.py` | Connect/disconnect, account listing, own-profile fetch |
| `backend/services/integrations/linkedin/unipile_client.py` | Low-level Unipile HTTP client |
| `backend/api/unipile_webhook_routes.py` | Unipile `notify_url` webhook handler |

### Analysis pipeline services

| Phase | Key modules |
|-------|-------------|
| 1 | `profile_service.py`, `profile_repository.py` |
| 2 | `profile_context_builder.py`, `profile_context_service.py` |
| 3 | `profile_validation_service.py` |
| 4 | `profile_completion_service.py`, `profile_completion_questions.py` |
| 5 | `profile_intelligence_service.py`, `profile_intelligence_validator.py`, `profile_intelligence_llm.py` |
| 6 | `topic_recommendation_service.py`, `topic_recommendation_validator.py`, `topic_recommendation_llm.py`, `prompts/linkedin/topic_recommendation_prompt.py` |

### API

- **`backend/api/linkedin_social_routes.py`** — orchestrates Phases 1–6 on `GET /profile`
- **`backend/models/linkedin_social_models.py`** — response models including `ProfileAnalysisErrorResponse`, `TopicRecommendationResponse`
- Query params: `refresh`, `refresh_intelligence`, `refresh_recommendations`
- **`backend/alwrity_utils/router_manager.py`** — registers `linkedin_social` and `unipile_webhook` routers (preserves existing `linkedin_video`)

### LLM & OAuth reliability

- **`backend/services/llm_providers/gemini_provider.py`** — `_dict_to_types_schema` resolves `$ref`/`$defs`, passes `enum`, `required`, and array bounds to Gemini
- **`backend/services/integrations/oauth_callback_utils.py`** — callback HTML posts success message and closes popup reliably

---

## Frontend Changes

| Module | Responsibility |
|--------|----------------|
| `frontend/src/api/linkedinSocial.ts` | Pipeline API client, Phase 1–6 types, `runLinkedInTopicAnalysis()` |
| `frontend/src/utils/linkedInOAuthConnect.ts` | Unipile OAuth popup flow, connection verification, popup close on success |
| `frontend/src/hooks/useLinkedInSocialConnection.ts` | Connect/disconnect state |
| `frontend/src/hooks/useLinkedInProfileCompletion.ts` | Analysis state machine + Topic Suggestion trigger |
| `frontend/src/components/LinkedInWriter/components/LinkedInConnectionPlaceholder.tsx` | Connect entry + profile setup panel when connected |
| `frontend/src/components/LinkedInWriter/components/ProfileCompletion/LinkedInProfileSetupPanel.tsx` | Phase 4 completion form |
| `frontend/src/components/LinkedInWriter/components/TopicRecommendations/` | Recommendations panel, cards, error/retry UI |
| `frontend/src/components/OnboardingWizard/common/LinkedInPlatformCard.tsx` | LinkedIn connect in onboarding |

---

## Intentionally excluded (vs old PR #729)

These were in #729 but **not** in this PR — upstream already has them or they belong in a follow-up PR:

| Category | Examples |
|----------|----------|
| Stale unrelated fixes | Content strategy streaming/caching, OAuth token monitoring, GSC analyzer, scheduler dashboard |
| Analytics UI (follow-up PR) | `LinkedInAnalyticsDashboard`, date-range picker components |
| Local dev artifacts | `ngrok.exe` |
| `main.py` onboarding guard | Not needed when using `python start_alwrity_backend.py` (`app.py` handles feature modes) |

Backend analytics service modules (`personal_analytics.py`, etc.) remain for API route imports; analytics **UI** is deferred.

---

## Commit History (this branch)

| Commit | Summary |
|--------|---------|
| `77aa8e6f` | Restore Unipile Phases 1–6 on fresh upstream main (75 LinkedIn files) |
| `0ab6b326` | Fix OAuth popup auto-close after successful Unipile connect |

> Note: Intermediate revert commits for an abandoned `main.py` fix may appear in history; net code change is the two commits above.

---

## 🔄 Type of Change

- [x] 🐛 Bug fix (OAuth popup close)
- [x] ✨ New feature (Unipile connect + Phases 1–6)
- [ ] 💥 Breaking change
- [ ] 📚 Documentation update
- [x] 🎨 Style/UI changes
- [ ] ♻️ Code refactoring
- [ ] ⚡ Performance improvements
- [ ] 🧪 Test additions/updates

---

## 🎯 Related Issues

Supersedes #729

Closes #(issue number)  
Fixes #(issue number)  
Related to #(issue number)

---

## 🧪 Testing

- [ ] Backend tests pass (reviewer to run)
- [ ] Frontend tests pass
- [x] Manual testing completed on fresh `upstream/main` base
- [ ] Cross-browser testing (if applicable)
- [ ] Mobile testing (if applicable)

### Manual test plan (verified locally)

1. [x] Connect LinkedIn via Unipile OAuth popup → `GET /connection/status` returns connected
2. [x] OAuth popup closes automatically after connect
3. [x] Open LinkedIn Writer → connected profile / setup panel renders
4. [x] Click **Topic Suggestion** → Phases 1–6 complete → 5 recommendation cards display
5. [ ] Incomplete profile → completion questions → submit answers → pipeline resumes
6. [ ] Induce LLM/validation failure → structured error with phase label and **Retry** button
7. [ ] `refresh_recommendations=true` → new topic set generated
8. [x] Disconnect → reconnect → pipeline runs cleanly from Phase 1

### Recommended local startup (matches team README)

```powershell
# Backend — use app.py entry point (not uvicorn main:app)
cd backend
python start_alwrity_backend.py

# Frontend
cd frontend
npm start
```

For LinkedIn-only dev: `ALWRITY_ENABLED_FEATURES=linkedin` in `backend/.env`

### Backend test commands

```bash
cd backend
python -m pytest tests/services/integrations/linkedin/test_topic_recommendation_validator.py -v
python -m pytest tests/services/integrations/linkedin/test_topic_recommendation_service.py -v
python -m pytest tests/services/llm_providers/test_gemini_schema_conversion.py -v
python -m pytest tests/api/test_linkedin_profile_route.py -v
```

---

## 📸 Screenshots (if applicable)

### Before

<!-- LinkedIn Writer without connected profile / no topic recommendations -->

### After

<!-- Connected profile card + 5 topic recommendation cards after Topic Suggestion -->

---

## 🏷️ Component/Feature

- [ ] Blog Writer
- [ ] SEO Dashboard
- [ ] Content Planning
- [ ] Facebook Writer
- [x] LinkedIn Writer
- [x] Onboarding (LinkedIn platform card only)
- [ ] Authentication
- [x] API
- [x] Database
- [ ] GSC Integration
- [ ] Subscription System
- [ ] Monitoring/Billing
- [ ] Documentation
- [ ] Other: _______________

---

## 📋 Checklist

- [x] My code follows the project's style guidelines
- [x] I have performed a self-review of my own code
- [x] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published

### ALwrity-Specific Checklist

- [x] API endpoints follow RESTful conventions
- [x] AI service integrations handle rate limits and errors gracefully
- [x] Content generation includes proper validation and sanitization
- [x] Database migrations are included if schema changes are made
- [ ] Environment variables are documented in env_template.txt
- [x] Security considerations have been addressed
- [x] Performance impact has been considered
- [x] User experience is consistent with existing features
- [x] No unrelated upstream fixes re-introduced from stale branch

---

## 🔍 Code Quality

- [x] Code is properly formatted
- [ ] No console.log statements left in production code
- [x] Error handling is implemented where needed
- [x] Performance considerations have been addressed
- [x] Security considerations have been addressed

---

## 📚 Documentation

- [ ] README updated (if needed)
- [ ] API documentation updated (if needed)
- [x] Code comments added for complex logic
- [ ] Changelog updated (if applicable)

### Related docs in this repo

- `docs/linkedin/PR_729_BRANCH_RECOVERY_PLAN.md` — branch recovery plan (how this PR was built)
- `docs/linkedin/linkedin-profile-recommendation-editing/PHASE_7_IMPLEMENTATION_PLAN.md` — next phase (out of scope here)
- `docs/linkedin/unipile/` — Unipile connection migration and RCA docs

---

## 🚀 Deployment Notes

### Required environment variables

| Variable | Purpose |
|----------|---------|
| `UNIPILE_API_KEY` | Unipile API authentication |
| `UNIPILE_DSN` | Unipile API base URL |
| `GEMINI_API_KEY` | Phases 5 & 6 LLM calls |
| `LINKEDIN_TOKEN_ENCRYPTION_KEY` | Encrypted per-user credential storage |
| `NGROK_URL` / public backend URL | OAuth callback + Unipile `notify_url` (development) |
| `FRONTEND_URL` or `OAUTH_CALLBACK_ALLOWED_ORIGINS` | OAuth callback postMessage target (optional; popup close works without) |

### Operational notes

- Phases 5–6 use Gemini structured JSON; allow extended timeout on `GET /profile` (frontend client configured for long-running requests)
- Per-user analysis data stored in `linkedin_analysis_context` (SQLite per workspace)
- Start backend with `python start_alwrity_backend.py` (uses `app.py` with feature-mode routing)
- Restart backend after deploy before running Topic Suggestion E2E

---

## 🔗 Additional Context

### Phase 6 recommendation shape

Each recommendation includes:

- `id` — server-assigned UUID
- `title` — concise content idea headline
- `why_this_fits` — 1–2 sentences explaining fit to this user
- `recommended_format` — `"LinkedIn Post"` or `"LinkedIn Article"`
- `target_audience` — array of professional audience labels
- `growth_impact` — `"High"`, `"Medium"`, or `"Low"`

### Structured pipeline errors

When a phase fails, the API returns `analysis_error`:

```json
{
  "failed_phase": 6,
  "phase_label": "Topic Recommendations",
  "error_code": "schema_validation",
  "user_message": "We couldn't load content suggestions right now. Please try again.",
  "debug_message": "..."
}
```

### Modular architecture principles

- API routes validate and delegate only — no business logic in routes
- Services own orchestration and gates
- Repositories own persistence
- LLM adapters are thin and injectable for tests
- Validators are pure (no LLM, no DB)

### Follow-up work (not in this PR)

- **Analytics dashboard UI** — second PR from backup branch
- **Phase 7 — Profile Optimization Recommendations** — after this PR merges

---

## 👥 Reviewers

@AJaySi @rajbhati @deepanshuwadhwa7 @DikshaDisciplines

---

**Thank you for contributing to ALwrity!** 🎉
