# Phase 7 — Step 8 Playbook (Tests + E2E Hardening)

Use this guide to close **Step 8** in `PHASE_7_IMPLEMENTATION_PLAN.md` before starting **Phase 8** (Unipile apply-from-ALwrity).

**Estimated time:** 1–2 hours (mostly manual staging checks).

---

## Overview

| Section | What you do | Pass criteria |
|---------|-------------|---------------|
| 8.1 | Run backend automated tests | All Phase 7 tests green |
| 8.2 | Verify hardening (code review, no new work unless gaps) | All checklist items confirmed |
| 8.3 | Manual E2E on staging | Every row checked once |
| 8.4 | Sign-off | Product + you agree Phase 7 is done |

---

## Prerequisites

1. **Backend deps installed** (includes `pytest-asyncio`):

   ```powershell
   cd c:\alwrity-tool\ALwrity\backend
   pip install -r requirements.txt
   ```

2. **Staging (or local dev) running** with:
   - LinkedIn connected via Unipile
   - Gemini API key configured
   - Frontend + backend both up

3. **Browser DevTools** open → Network tab (filter: `profile` or `linkedin-social`).

---

## 8.1 — Automated tests

### Run all Phase 7 tests (one command)

From `backend/`:

```powershell
python -m pytest `
  tests/services/integrations/linkedin/test_profile_optimization_rubric.py `
  tests/services/integrations/linkedin/test_profile_optimization_validator.py `
  tests/services/integrations/linkedin/test_profile_optimization_llm.py `
  tests/services/integrations/linkedin/test_profile_optimization_service.py `
  tests/api/test_linkedin_profile_route.py `
  -v
```

**Expected:** ~52 tests pass.

### If API route tests fail with “async def functions are not natively supported”

Install the async plugin (already in `requirements.txt`):

```powershell
pip install "pytest-asyncio>=0.21.0"
```

Re-run the command above.

### Test matrix — what each file covers

| File | Status | Notes |
|------|--------|-------|
| `test_profile_optimization_rubric.py` | ✅ Exists | Gap detection rules |
| `test_profile_optimization_validator.py` | ✅ Exists | Normalization + validation |
| `test_profile_optimization_llm.py` | ✅ Exists | LLM adapter + **Gemini schema** (`test_gemini_schema_is_lightweight_and_capped`) |
| `test_profile_optimization_service.py` | ✅ Exists | Service + **repository persistence** via real SQLite fixture |
| `test_linkedin_profile_route.py` | ✅ Exists | API flags: `include_profile_optimization`, `refresh_profile_optimization`, Phase 7 not called on default load |
| `test_profile_repository_profile_optimization.py` | ⚪ Optional | Not a separate file — repo behavior is covered in service tests. Add only if you want isolated repo tests. |
| `test_gemini_schema_conversion.py` | ⚪ N/A | Plan name is legacy; Phase 7 schema tests live in `test_profile_optimization_llm.py`. |

### Record results

- [ ] All 52 tests pass locally
- [ ] (Optional) CI green on your PR branch

---

## 8.2 — Hardening checklist (verify, don’t rebuild)

Walk through each item. If Phase 7 already works reliably, these should already be true — you are **confirming**, not implementing.

### 1. Gemini schema uses flat enum fields

**Where:** `backend/services/integrations/linkedin/profile_optimization_types.py` → `profile_optimization_gemini_json_schema()`

**Check:** Schema uses flat `"type": "string"` for `profile_section`, `impact`, `effort` — **no** nested `$ref` / strict Pydantic enums sent to Gemini.

**Test:** `test_gemini_schema_is_lightweight_and_capped` in `test_profile_optimization_llm.py`

- [ ] Confirmed

### 2. Normalization defaults for enum drift

**Where:** `backend/services/integrations/linkedin/profile_optimization_validator.py` → `normalize_profile_optimization_raw`, `_normalize_profile_section`, `_normalize_impact`, `_normalize_effort`

**Check:** Unknown LLM values default to safe enums (e.g. `summary`, `Medium`) with Loguru warnings.

**Test:** validator tests cover alias mapping and defaults.

- [ ] Confirmed

### 3. One validation retry on LLM failure

**Where:** `backend/services/integrations/linkedin/profile_optimization_service.py` → `_call_llm_with_validation_retry`

**Check:** First LLM response validated; on validation failure, **one** retry with `VALIDATION_RETRY_USER_SUFFIX`; second failure raises.

- [ ] Confirmed (read code or grep logs during a forced bad response in dev)

### 4. Loguru on service entry/exit/decisions

**Where:** `profile_optimization_service.py`, `profile_optimization_llm.py`

**Check:** `[ProfileOptimization]` prefix logs on generate, cache hit, batch advance, retry, errors.

- [ ] Confirmed (tail backend logs during one “Improve My Profile” flow)

### 5. No secrets in logs

**Check:** Search logs during E2E — no API keys, tokens, or full Unipile payloads.

- [ ] Confirmed

### 6. `analysis_error.failed_phase = 7` surfaces in UI

**Where:**
- Backend: `linkedin_social_routes.py` → `_make_analysis_error(..., phase=7)`
- Frontend: `useLinkedInProfileOptimization.ts`, `LinkedInProfileSetupPanel.tsx`, debug strip

**How to test manually:**
1. Temporarily break Phase 7 (e.g. invalid Gemini key in staging **only**), or use dev mock.
2. Click **Improve My Profile**.
3. UI shows user-facing error + retry; debug strip (if enabled) shows `failed_phase: 7`.
4. **Get Topic Ideas** (Phase 6) still works.

- [ ] Confirmed

---

## 8.3 — Manual E2E checklist (staging)

Do this **once** on staging with a real LinkedIn account. Check each box.

### Setup

- [ ] LinkedIn connected (Unipile) — profile loads in ALwrity

### 1. Foundation load — no eager LLM

1. Open **LinkedIn Writer**.
2. Wait for profile foundation (phases 1–5) to load.
3. In Network tab: **no** Phase 6 or Phase 7 LLM calls on initial load.

- [ ] Pass

### 2. Improve My Profile

1. Click **Improve My Profile**.
2. Wait for cards to load.
3. Expect **5 optimization cards** with real headline/summary snippets from your profile.

- [ ] Pass

### 3. Get Topic Ideas (Phase 6 regression)

1. Click **Get Topic Ideas**.
2. Expect **5 topic cards** — same behavior as before Phase 7.

- [ ] Pass

### 4. Backlog / batch progression

1. Mark **2** optimization items as done.
2. Refresh or trigger next batch (per UI flow).
3. Expect next items from **backlog without a new LLM call** (check Network — no new Gemini request if backlog has items).

- [ ] Pass

### 5. Profile hash invalidation

1. Edit your **headline** on LinkedIn (small change).
2. In ALwrity, refresh profile optimization.
3. Expect **new recommendations** (cache invalidated by hash change).

- [ ] Pass

### 6. Phase 7 error isolation

1. Trigger a Phase 7 error (staging misconfig or dev-only) **or** simulate via API error response.
2. **Retry** button works for Phase 7.
3. Phase 6 topic flow still usable.

- [ ] Pass

---

## 8.4 — Phase 7 “done” definition

Phase 7 is **complete** when all of the following are true:

| # | Criterion | How to close |
|---|-----------|--------------|
| 1 | Step 8.3 E2E passes on staging | All boxes checked above |
| 2 | Backend unit tests pass | Section 8.1 green |
| 3 | No Phase 6 regression | “Get Topic Ideas” row in 8.3 |
| 4 | Product sign-off on copy + card UX | Review with PM/design — card text, expand/copy, done flow |
| 5 | Manual playbook complete | This document fully checked |

### Final actions

1. Update `PHASE_7_IMPLEMENTATION_PLAN.md` Step 8 status: **Complete**.
2. Tick checkboxes in sections 8.2 and 8.3 in that plan (or link to this doc).
3. **Only then** branch for Phase 8 (Unipile apply-from-ALwrity).

---

## Quick reference — API flags (for debugging)

`GET /api/linkedin-social/profile` query params used in Phase 7:

| Param | Purpose |
|-------|---------|
| `include_profile_optimization=true` | Loads Phase 7 recommendations |
| `refresh_profile_optimization=true` | Forces regeneration (respects hash) |
| `debug_profile_optimization_gaps=true` | Dev: shows rubric gaps in response |

Default profile load **must not** set `include_profile_optimization` — Phase 7 is on-demand only.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| API tests fail — async | `pip install pytest-asyncio` |
| 40 pass, 12 API fail | Same as above |
| Cards empty after “Improve My Profile” | Check Gemini key, backend logs `[ProfileOptimization]` |
| Backlog doesn’t advance | Confirm items marked done; check `profile_optimization_json` in DB |
| Hash invalidation doesn’t fire | Confirm LinkedIn headline actually changed; hard refresh profile first |

---

## Optional follow-up (not blocking Phase 8)

- Dedicated `test_profile_repository_profile_optimization.py` if you want repo-only tests
- CI job that runs the Phase 7 pytest subset on every PR touching `profile_optimization_*`
