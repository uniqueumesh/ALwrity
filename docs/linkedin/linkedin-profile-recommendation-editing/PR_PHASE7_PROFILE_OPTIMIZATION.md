# Manual PR — Phase 7 Profile Optimization Recommendations

Use this document when opening the PR on GitHub. Copy each section as indicated.

---

## GitHub PR settings (fill in the form)

| Field | Value |
|-------|-------|
| **Base repository** | `ALwrity/ALwrity` |
| **Base branch** | `main` |
| **Head repository** | `uniqueumesh/ALwrity` |
| **Compare branch** | `feat/linkedin-profile-optimization-phase7` |
| **Title** | `feat(linkedin): Phase 7 profile optimization recommendations (Steps 0–7)` |

**Open PR link (upstream):**  
https://github.com/ALwrity/ALwrity/compare/main...uniqueumesh:feat/linkedin-profile-optimization-phase7?expand=1

**Fork PR link (optional preview):**  
https://github.com/uniqueumesh/ALwrity/compare/main...feat/linkedin-profile-optimization-phase7?expand=1

**Reviewer (optional):** `@AJaySi`

**Expected diff:** 8 commits · 27 files · +6,778 / −117 lines (rebased on latest upstream `main`)

**Branch note:** Clean history on `feat/linkedin-profile-optimization-phase7` (upstream `main` + 8 Phase 7 commits). Does **not** include revert/re-apply noise or duplicate collapse-panel commit (`eb07b13e` already on upstream).

---

## Commits included (8)

| Step | Commit | Message |
|------|--------|---------|
| 0 | `5e7f183a` | feat(linkedin): Step 0 UI shell + gate Phase 6 on demand |
| 1 | `0557a8b0` | feat(linkedin): Phase 7 Step 1 — optimization rubric and gap debug UI |
| 2 | `bbd95cfb` | fix(linkedin): Phase 7 lightweight Gemini schema — 5 items per LLM call |
| 3 | `4e0d7a78` | feat(linkedin): Phase 7 Step 3 — profile optimization validator and normalization |
| 4 | `4a23dfbb` | feat(linkedin): Phase 7 Step 4 — profile optimization service and persistence |
| 5 | `bca0d310` | feat(linkedin): wire Phase 7 profile optimization API and live UI hook |
| 6 | `4253352b` | feat(linkedin): polish Phase 7 profile optimization card UX with expand and copy |
| 7 | `0e453f27` | feat(linkedin): add Phase 7 profile optimization batch progression |

---

## PR body (copy everything below this line into GitHub)

## 📝 Description

Implements **Phase 7 — Profile Optimization Recommendation Engine** for LinkedIn Writer (Steps 0–7).

Users with a complete LinkedIn profile can click **Improve My Profile** to receive 5 actionable optimization recommendations (headline, summary, experience, etc.), mark items done/skipped, and load the next batch from server backlog without redundant LLM calls.

### Highlights

- **Step 0:** UI shell + dual CTAs; foundation load on mount; Phase 6/7 gated behind explicit user actions (no LLM on default page load)
- **Steps 1–4:** Rubric, lightweight Gemini schema, validator, service + SQLite persistence via `ProfileRepository`
- **Step 5:** Live API + hook + recommendation cards with error/retry states
- **Step 6:** Card UX polish — expand/collapse, copy-to-clipboard, impact pills
- **Step 7:** Batch progression — `POST .../complete`, `POST .../next-batch`, mark done/skip UI

### Architecture (mirrors Phase 6 pattern)

```
types → prompt → profile_optimization_llm.py → validator → service → API routes → React hook/UI
```

### Key backend files

| File | Purpose |
|------|---------|
| `backend/services/integrations/linkedin/profile_optimization_*.py` | Orchestration, LLM adapter, validator, rubric |
| `backend/api/linkedin_social_routes.py` | GET profile flags + batch action endpoints |
| `backend/models/linkedin_social_models.py` | Response/request models |
| `backend/services/integrations/linkedin/profile_repository.py` | `profile_optimization_json` persistence |

### Key frontend files

| File | Purpose |
|------|---------|
| `frontend/src/hooks/useLinkedInProfileOptimization.ts` | Panel state, fetch, mark done, next batch |
| `frontend/src/components/LinkedInWriter/components/ProfileOptimization/*` | Panel, cards, intro, debug strip |
| `frontend/src/api/linkedinSocial.ts` | API client + error mapping |
| `frontend/src/hooks/useLinkedInProfileCompletion.ts` | Foundation vs topic analysis split |

### Out of scope (this PR)

- Phase 8 (Unipile apply-from-ALwrity)
- Step 8 automated test hardening (follow-up PR after merge)
- Phase 6 topic recommendation schema changes

---

## 🔄 Type of Change

- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [x] ✨ New feature (non-breaking change which adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 📚 Documentation update
- [x] 🎨 Style/UI changes
- [ ] ♻️ Code refactoring
- [ ] ⚡ Performance improvements
- [x] 🧪 Test additions/updates

---

## 🎯 Related Issues

N/A — Phase 7 profile optimization (product plan in repo docs). No linked GitHub issue.

---

## 🧪 Testing

- [x] Backend tests pass (**52 passed** — Phase 7 rubric, validator, LLM, service, API route)
- [ ] Frontend tests pass (no new frontend unit tests in this PR)
- [x] Manual testing completed (2026-06-21, rebased on upstream `main`)
- [ ] Cross-browser testing (if applicable)
- [ ] Mobile testing (if applicable)

### Automated tests run

```powershell
cd backend
..\myenv\Scripts\python.exe -m pytest `
  tests/services/integrations/linkedin/test_profile_optimization_rubric.py `
  tests/services/integrations/linkedin/test_profile_optimization_validator.py `
  tests/services/integrations/linkedin/test_profile_optimization_llm.py `
  tests/services/integrations/linkedin/test_profile_optimization_service.py `
  tests/api/test_linkedin_profile_route.py -q
```

**Result:** 52 passed

### Manual test checklist (all passed)

| # | Test | Result |
|---|------|--------|
| 1 | Open LinkedIn Writer — foundation loads; no Phase 6/7 LLM on default load | ✅ |
| 2 | **Improve My Profile** → 5 optimization cards with real profile snippets | ✅ |
| 3 | **Mark as done** / **Skip** — card disappears without full reload | ✅ |
| 4 | **Get Topic Ideas** — Phase 6 unchanged | ✅ |
| 5 | App runs on latest upstream `main` base (onboarding + collapse panel) | ✅ |

**Test env:** `ALWRITY_ENABLED_FEATURES=linkedin` in local `backend/.env` (not committed).

---

## 📸 Screenshots (if applicable)

### Before
No **Improve My Profile** flow; Phase 6 topic recommendations only.

### After
- Dual CTAs: **Improve My Profile** + **Get Topic Ideas**
- 5 optimization cards with expand, copy, mark done/skip
- Next-batch CTA when backlog remains

*(Add screenshots before submitting if available.)*

---

## 🏷️ Component/Feature

- [ ] Blog Writer
- [ ] SEO Dashboard
- [ ] Content Planning
- [ ] Facebook Writer
- [x] LinkedIn Writer
- [ ] Onboarding
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
- [x] My changes generate no new warnings (deprecation warnings pre-existing in profile_repository)
- [x] I have added tests that prove my fix is effective or that my feature works
- [x] New and existing unit tests pass locally with my changes
- [x] Any dependent changes have been merged and published (rebased on upstream `main`)

### ALwrity-Specific Checklist

- [x] API endpoints follow RESTful conventions
- [x] AI service integrations handle rate limits and errors gracefully
- [x] Content generation includes proper validation and sanitization
- [x] Database migrations are included if schema changes are made (SQLite column via repository — no Alembic migration)
- [ ] Environment variables are documented in env_template.txt
- [x] Security considerations have been addressed
- [x] Performance impact has been considered (cache-first; batch promotion without LLM)
- [x] User experience is consistent with existing features

---

## 🔍 Code Quality

- [x] Code is properly formatted
- [x] No console.log statements left in production code (dev-only debug strip uses guarded logging)
- [x] Error handling is implemented where needed
- [x] Performance considerations have been addressed
- [x] Security considerations have been addressed

---

## 📚 Documentation

- [ ] README updated (if needed)
- [ ] API documentation updated (if needed)
- [x] Code comments added for complex logic
- [ ] Changelog updated (if applicable)

---

## 🚀 Deployment Notes

- No new required env vars beyond existing Gemini/LinkedIn setup
- Feature gated by existing LinkedIn Writer routes
- `profile_optimization_json` stored in existing LinkedIn analysis SQLite row

---

## 🔗 Additional Context

- Rebased onto upstream `ALwrity/ALwrity` `main` (`fd7e7d2c`) — includes onboarding fixes, landing page updates, and collapsible topic recommendations (`eb07b13e`)
- Fork `main` synced with upstream before feature branch rebuild
- Step 8 (additional automated tests) planned as **follow-up PR** — not included here
- Backup branches retained locally: `backup/step7-working-2026-06-21`, `backup/full-feature-noisy-2026-06-21`

---

## 👥 Reviewers

@AJaySi @uniqueumesh

---

**Thank you for contributing to ALwrity!** 🎉

---

## After opening the PR

1. Confirm GitHub compare shows **8 commits** and **27 files**
2. Add screenshots if you have them
3. When merged, optionally delete old noisy branch `feat/linkedin-topic-recommendations-collapse` on fork
4. Start Step 8 test hardening in a new branch from updated `main`
