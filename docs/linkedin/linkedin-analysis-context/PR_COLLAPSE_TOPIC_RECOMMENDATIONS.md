# Manual PR — Collapsible Topic Recommendations (Phase 6 UX)

Use this document when opening the PR on GitHub. Copy each section as indicated.

---

## GitHub PR settings (fill in the form)

| Field | Value |
|-------|-------|
| **Base repository** | `ALwrity/ALwrity` |
| **Base branch** | `main` |
| **Head repository** | `uniqueumesh/ALwrity` |
| **Compare branch** | `feat/linkedin-topic-recommendations-collapse` |
| **Title** | `feat(linkedin): collapsible topic recommendations panel (Phase 6 UX)` |

**Open PR link:**  
https://github.com/ALwrity/ALwrity/compare/main...uniqueumesh:feat/linkedin-topic-recommendations-collapse?expand=1

**Reviewer (optional):** Request review from `@AJaySi` only (or your team lead).

**Expected diff:** 1 commit · 4 files · +241 / −31 lines

---

## PR body (copy everything below this line into GitHub)

## 📝 Description

Adds **Hide topics / Show topics** to the Phase 6 LinkedIn Writer panel ("What to write next").

After Topic Suggestion returns 5 cards, users can collapse the list to a compact summary bar and expand again instantly from React state — **no API re-fetch on expand**. **Get new ideas** re-runs the existing topic analysis flow and auto-expands the list.

**Scope:** Frontend only. No backend, API contract, or database changes.

### Files changed

| File | Change |
|------|--------|
| `frontend/src/hooks/useLinkedInProfileCompletion.ts` | `isRecommendationsExpanded` state + collapse/expand actions |
| `frontend/src/components/LinkedInWriter/components/ProfileCompletion/LinkedInProfileSetupPanel.tsx` | Wire collapse props into panel |
| `frontend/src/components/LinkedInWriter/components/TopicRecommendations/TopicRecommendationsPanel.tsx` | Expanded vs collapsed layout, Hide topics button |
| `frontend/src/components/LinkedInWriter/components/TopicRecommendations/TopicRecommendationsSummaryBar.tsx` | **New** — collapsed summary bar UI |

### Behaviour

| Action | Result |
|--------|--------|
| Topic Suggestion completes | List expanded (unchanged from today) |
| **Hide topics** | Cards hidden; summary bar shows `N ideas · Updated …` |
| **Show topics** | Same 5 cards return instantly from memory |
| **Get new ideas** | Re-runs `runTopicAnalysis`; list auto-expands |
| Error state | Panel stays expanded so Retry remains visible |

---

## 🔄 Type of Change

- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [x] ✨ New feature (non-breaking change which adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 📚 Documentation update
- [x] 🎨 Style/UI changes
- [ ] ♻️ Code refactoring
- [ ] ⚡ Performance improvements
- [ ] 🧪 Test additions/updates

---

## 🎯 Related Issues

N/A — Phase 6 UX polish (pre–Phase 7). No linked issue.

---

## 🧪 Testing

- [ ] Backend tests pass
- [ ] Frontend tests pass
- [x] Manual testing completed
- [ ] Cross-browser testing (if applicable)
- [ ] Mobile testing (if applicable)

### Manual test checklist (Phase D — all passed)

| # | Test | Result |
|---|------|--------|
| 1 | Connect LinkedIn | OAuth completes; popup closes |
| 2 | Topic Suggestion | 5 cards appear expanded |
| 3 | Hide topics | Summary bar only; cards hidden |
| 4 | Show topics | Same 5 cards instantly; no API reload |
| 5 | Get new ideas | Re-runs analysis; list expands |
| 6 | Error / Retry | Panel stays expanded on error |
| 7 | App on latest main | No console errors with persona Phase 3–4 + LinkedIn |

**Test env:** `ALWRITY_ENABLED_FEATURES=linkedin` in local `backend/.env` (not committed).

---

## 📸 Screenshots (if applicable)

### Before
Topic list always fully open after Topic Suggestion — no way to hide.

### After
- Expanded: full panel + **Hide topics** in header
- Collapsed: summary bar with **Show topics** and **Get new ideas**

*(Add screenshots here if you have them.)*

---

## 🏷️ Component/Feature

- [ ] Blog Writer
- [ ] SEO Dashboard
- [ ] Content Planning
- [ ] Facebook Writer
- [x] LinkedIn Writer
- [ ] Onboarding
- [ ] Authentication
- [ ] API
- [ ] Database
- [ ] GSC Integration
- [ ] Subscription System
- [ ] Monitoring/Billing
- [ ] Documentation
- [ ] Other: _______________

---

## 📋 Checklist

- [x] My code follows the project's style guidelines
- [x] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [x] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [x] Any dependent changes have been merged and published

### ALwrity-Specific Checklist

- [x] API endpoints follow RESTful conventions *(N/A — no API changes)*
- [x] AI service integrations handle rate limits and errors gracefully *(unchanged)*
- [x] Content generation includes proper validation and sanitization *(N/A)*
- [x] Database migrations are included if schema changes are made *(N/A)*
- [x] Environment variables are documented in env_template.txt *(N/A)*
- [x] Security considerations have been addressed
- [x] Performance impact has been considered *(UI-only; no extra API calls on expand)*
- [x] User experience is consistent with existing features

---

## 🔍 Code Quality

- [x] Code is properly formatted
- [x] No console.log statements left in production code *(uses `console.info` for collapse/expand — matches existing hook logging)*
- [x] Error handling is implemented where needed
- [x] Performance considerations have been addressed
- [x] Security considerations have been addressed

---

## 📚 Documentation

- [ ] README updated (if needed)
- [ ] API documentation updated (if needed)
- [ ] Code comments added for complex logic
- [ ] Changelog updated (if applicable)

---

## 🚀 Deployment Notes

None. Frontend-only change — deploy with normal frontend release. No new env vars or migrations.

---

## 🔗 Additional Context

- Rebased on `upstream/main` @ `86b0b5d4` (persona Phase 3–4)
- Single commit: `f4903bb5` — `feat(linkedin): add collapsible topic recommendations panel`
- Local plan: `docs/linkedin/linkedin-analysis-context/TOPIC_RECOMMENDATIONS_COLLAPSE_PLAN.md`

**What we are NOT doing in this PR:**

- Delete topics on hide (data stays in React state)
- Auto-collapse on navigation
- Phase 7 profile optimization
- Backend or persistence changes

---

## 👥 Reviewers

@AJaySi

---

**Thank you for contributing to ALwrity!** 🎉
