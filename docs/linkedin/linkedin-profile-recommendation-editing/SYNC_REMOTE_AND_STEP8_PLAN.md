# Sync with Upstream + Clean History + Step 8 + PR Plan

**Date:** 2026-06-21 (v2 — upstream-aware)  
**Status:** Plan only — no app code changes yet  
**Prerequisite:** LinkedIn Writer running smoothly at Step 7 (`2ce2f81f`) — confirmed

---

## 1. Remotes (read this first)

| Remote | URL | Role |
|--------|-----|------|
| **upstream** | [https://github.com/ALwrity/ALwrity](https://github.com/ALwrity/ALwrity) | Official repo — **source of truth for `main`** |
| **origin** | https://github.com/uniqueumesh/ALwrity.git | Your fork — where you push and open PRs |

You are **not** syncing only fork ↔ local. The goal is:

1. Bring **local `main`** up to **upstream `main`** (8 commits behind).
2. Rebuild **feature branch** on top of upstream `main` with **clean history** (no revert/re-apply noise, no duplicate commits).
3. Tally all work, remove duplicates, then Step 8 + PR to upstream.

---

## 2. Current state (verified 2026-06-21)

### 2.1 `main` — fork is 8 commits behind upstream

| Branch | Commit | Tip message |
|--------|--------|-------------|
| Local `main` | `86b0b5d4` | feat(persona): Phase 4 — Expand all / Collapse all |
| `origin/main` | `86b0b5d4` | Same as local |
| **`upstream/main`** | **`fd7e7d2c`** | fix(onboarding): step 3 sitemap thundering herd… |

**8 commits on upstream not in your fork `main`:**

| # | Commit | Summary |
|---|--------|---------|
| 1 | `2e202bda` | linkedin video prompt optimization |
| 2 | `eb07b13e` | feat(linkedin): collapsible topic recommendations panel |
| 3 | `d1f391b5` | fix(step5): OAuth callback functional setState |
| 4 | `f9083092` | fix(logs): demote routine log lines to debug |
| 5 | `f1786082` | test(logs): log-level demotion tests |
| 6 | `51e24140` | Landing page overhaul |
| 7 | `990e0179` | perf(step5): walkthrough arrays module scope |
| 8 | `fd7e7d2c` | fix(onboarding): step 3 thundering herd |

### 2.2 Feature branch — your Phase 7 work

| Branch | Commit | Notes |
|--------|--------|-------|
| Local (backup) | `2ce2f81f` | **Clean Step 7** — tested, working |
| `origin/feat/linkedin-topic-recommendations-collapse` | `5d227654` | Same **code** as `2ce2f81f` + 2 noise commits |

**Noise commits to remove** (zero file diff vs `2ce2f81f`):

```
02802726  Revert Step 7
5d227654  Reapply Step 7
```

**Duplicate commit to drop** (same feature already merged upstream):

| Your fork | Upstream | Same files changed |
|-----------|----------|-------------------|
| `f4903bb5` | `eb07b13e` | 4 files, identical +241/−31 lines |

Both implement *collapsible topic recommendations panel*. After rebasing onto upstream, **keep upstream’s `eb07b13e` only** — do not cherry-pick `f4903bb5`.

### 2.3 Phase 7 commits to **keep** (cherry-pick onto upstream/main)

| Step | Commit | Message |
|------|--------|---------|
| 0 | `d322bfcd` | Step 0 UI shell + gate Phase 6 on demand |
| 1 | `1eb75dfc` | Phase 7 Step 1 — optimization rubric |
| 2 | `b657bf90` | Phase 7 lightweight Gemini schema |
| 3 | `d1e3d293` | Phase 7 Step 3 — validator |
| 4 | `42039946` | Phase 7 Step 4 — service + persistence |
| 5 | `2e5b194b` | Wire Phase 7 API and live UI |
| 6 | `2c8b07c1` | Card UX polish |
| 7 | `2ce2f81f` | Batch progression |

**Net result after clean rebase:** `upstream/main` + **8 commits** (Phase 7 only).

### 2.4 Safety nets already on disk

| Backup | Points to |
|--------|-----------|
| `backup/step7-working-2026-06-21` | `2ce2f81f` ✅ |
| `backup/before-cleanup-2026-06-21` | `235887eb` |
| `backup/revert-state-2026-06-21` | `02802726` |
| `stash@{0}` | WIP topic fix (preserve — do not drop until reviewed) |

---

## 3. End goal (definition of done)

| # | Outcome |
|---|---------|
| 1 | Local + `origin/main` = `upstream/main` (`fd7e7d2c`) |
| 2 | Feature branch = `upstream/main` + 8 Phase 7 commits (no revert/reapply, no duplicate collapse commit) |
| 3 | `git diff 2ce2f81f <new-feature-tip>` empty for **Phase 7 app files** (code preserved) |
| 4 | Duplicate/unnecessary files audited and removed |
| 5 | Step 8 tests committed in one PR-ready commit |
| 6 | PR opened: `uniqueumesh/ALwrity` → `ALwrity/ALwrity` `main` |

---

## 4. Phase A — Safety backup (always first)

```powershell
cd c:\alwrity-tool\ALwrity

# Tag exact working Step 7 (immutable pointer)
git tag -f backup/step7-working 2ce2f81f

# Branch snapshots
git branch backup/full-feature-noisy-2026-06-21 feat/linkedin-topic-recommendations-collapse
git branch backup/main-before-upstream-sync main

git fetch origin
git fetch upstream
```

**Nothing is deleted.** All current states remain reachable.

---

## 5. Phase B — Update local `main` with upstream

```powershell
git checkout main
git pull --ff-only upstream main
git push origin main
```

**Verify:**

```powershell
git rev-parse main
git rev-parse upstream/main
# Both should print: fd7e7d2c...
```

Your fork on GitHub will no longer show “8 commits behind” on `main`.

---

## 6. Phase C — Rebuild clean feature branch (removes noise + duplicate)

This replaces revert/re-apply commits and duplicate collapse commit with a linear history on upstream.

### C1 — Create clean branch from upstream main

```powershell
git checkout -B feat/linkedin-profile-optimization-phase7 upstream/main
```

(`-B` resets the branch name if it already exists locally — your backup in Phase A preserves the old one.)

### C2 — Cherry-pick Phase 7 commits only (in order)

```powershell
git cherry-pick d322bfcd
git cherry-pick 1eb75dfc
git cherry-pick b657bf90
git cherry-pick d1e3d293
git cherry-pick 42039946
git cherry-pick 2e5b194b
git cherry-pick 2c8b07c1
git cherry-pick 2ce2f81f
```

**Do NOT cherry-pick:** `f4903bb5`, `02802726`, `5d227654`.

If a cherry-pick conflicts (likely on collapse-panel files because upstream already has `eb07b13e`):

- **Keep upstream version** for topic collapse UI files.
- **Keep your Phase 7 changes** for profile optimization files.
- Resolve, then: `git cherry-pick --continue`

### C3 — Tally: prove Phase 7 code is intact

```powershell
# Phase 7 file tree should match tested commit
git diff 2ce2f81f HEAD -- backend/api/linkedin_social_routes.py `
  backend/services/integrations/linkedin/profile_optimization_service.py `
  backend/models/linkedin_social_models.py `
  frontend/src/api/linkedinSocial.ts `
  frontend/src/hooks/useLinkedInProfileOptimization.ts
# Expected: no output (or only upstream-compatible conflict resolutions documented)

# Full stat vs upstream (your PR size)
git diff --stat upstream/main HEAD
```

### C4 — Push clean branch to fork

Because history was rewritten, use **force-with-lease** (safe force — aborts if someone else pushed):

```powershell
git push --force-with-lease origin feat/linkedin-profile-optimization-phase7:feat/linkedin-topic-recommendations-collapse
```

Optionally delete old noisy remote history only **after** push succeeds and tests pass.

**Alternative branch name:** keep pushing to `feat/linkedin-topic-recommendations-collapse` as above, or push new name and open PR from that.

---

## 7. Phase D — File & commit audit (no work lost)

### D1 — Commit inventory checklist

After Phase C, run:

```powershell
git log --oneline upstream/main..HEAD
```

**Expected: exactly 8 commits** (Steps 0–7). If you see 9+, identify extras before proceeding.

Compare with GitHub:  
https://github.com/uniqueumesh/ALwrity/compare/ALwrity:main...feat/linkedin-topic-recommendations-collapse

### D2 — Duplicate file audit

| Area | Action |
|------|--------|
| Topic collapse panel (`TopicRecommendationsPanel.tsx`, `TopicRecommendationsSummaryBar.tsx`) | **One version only** — upstream `eb07b13e` base + your Phase 7 edits on top |
| Profile optimization (`ProfileOptimization/*`, `profile_optimization_*.py`) | **Keep all** — this is your Phase 7 work |
| Backup branches | **Keep locally** until PR merged — do not push backup branches |
| `stash@{0}` | Review before dropping — may contain Phase 6 WIP fix |

### D3 — Docs folder note

`docs/linkedin/` is **gitignored** (`.gitignore` line 239). Plan files like this one stay **local** unless you explicitly un-ignore for the PR. **Your Phase 7 code is not in docs/** — nothing lost for the PR.

### D4 — Untracked / cache cleanup (optional, after tally)

```powershell
# Preview only
git clean -fdn

# Safe: Python cache only
Get-ChildItem -Recurse -Directory -Filter __pycache__ backend | Remove-Item -Recurse -Force
```

**Do not** `git clean -fd` on whole repo until you confirm the preview list.

---

## 8. Phase E — Verify before Step 8

### E1 — Automated tests (baseline)

```powershell
cd c:\alwrity-tool\ALwrity\backend
..\myenv\Scripts\python.exe -m pytest `
  tests/services/integrations/linkedin/test_profile_optimization_rubric.py `
  tests/services/integrations/linkedin/test_profile_optimization_validator.py `
  tests/services/integrations/linkedin/test_profile_optimization_llm.py `
  tests/services/integrations/linkedin/test_profile_optimization_service.py `
  tests/api/test_linkedin_profile_route.py -v --tb=short
```

### E2 — Manual smoke (5 min)

| # | Test | Pass? |
|---|------|-------|
| 1 | LinkedIn Writer loads (foundation only) | |
| 2 | **Improve My Profile** → 5 cards | |
| 3 | Mark done / skip works | |
| 4 | **Get Topic Ideas** works | |
| 5 | Onboarding still works (upstream fixes present) | |

Restart backend + frontend after rebase.

---

## 9. Phase F — Step 8 (after clean base confirmed)

Reference: [`PHASE_7_IMPLEMENTATION_PLAN.md`](./PHASE_7_IMPLEMENTATION_PLAN.md) § Step 8

### Already in tree (Steps 0–7)

- `test_profile_optimization_rubric.py`
- `test_profile_optimization_validator.py`
- `test_profile_optimization_llm.py`
- `test_profile_optimization_service.py` (includes batch tests)
- Partial `test_linkedin_profile_route.py`

### Still to add (one commit)

| # | Item | File |
|---|------|------|
| 1 | Repository tests | **New** `test_profile_repository_profile_optimization.py` |
| 2 | Gemini schema | Extend `test_gemini_schema_conversion.py` |
| 3 | Validation retry | Extend `test_profile_optimization_service.py` |
| 4 | Batch API routes | Extend `test_linkedin_profile_route.py` |
| 5 | Manual E2E | Playbook §8.3 |

**Rules:** one commit, all files tracked, pytest after each layer, manual E2E before push.

```powershell
git commit -m "test(linkedin): add Phase 7 automated test hardening for profile optimization"
git push origin feat/linkedin-topic-recommendations-collapse
```

---

## 10. Phase G — Open clean PR to upstream

Target: [ALwrity/ALwrity](https://github.com/ALwrity/ALwrity) `main`

```powershell
gh pr create `
  --repo ALwrity/ALwrity `
  --base main `
  --head uniqueumesh:feat/linkedin-topic-recommendations-collapse `
  --title "feat(linkedin): Phase 7 profile optimization recommendations" `
  --body "## Summary
- Phase 7 profile optimization (Steps 0–7): UI shell, LLM pipeline, live cards, batch progression
- Rebased on latest upstream main (includes collapsible topic recommendations)
- Step 8 automated test hardening

## Test plan
- [ ] Improve My Profile loads 5 recommendations
- [ ] Mark done / skip / next batch
- [ ] Get Topic Ideas unchanged
- [ ] pytest Phase 7 suite passes
"
```

**Compare link for reviewers:**  
https://github.com/ALwrity/ALwrity/compare/main...uniqueumesh:feat/linkedin-topic-recommendations-collapse

---

## 11. Rollback (if rebase goes wrong)

```powershell
# Instant return to tested Step 7 code
git checkout backup/step7-working-2026-06-21

# Return to noisy but complete feature branch
git checkout backup/full-feature-noisy-2026-06-21

# Return main to pre-sync
git checkout backup/main-before-upstream-sync
```

---

## 12. Execution order summary

```
Phase A  Backup tags/branches
    ↓
Phase B  main ← upstream/main (fix "8 behind")
    ↓
Phase C  Clean feature branch (cherry-pick 8 commits, drop noise + duplicate)
    ↓
Phase D  Commit + file audit
    ↓
Phase E  Tests + manual smoke
    ↓
Phase F  Step 8 tests (one commit)
    ↓
Phase G  PR → ALwrity/ALwrity
```

---

## 13. What to tell the agent when ready

> "Run Phase A–E per SYNC_REMOTE_AND_STEP8_PLAN.md v2. Sync main with upstream, rebuild feature branch with cherry-pick (no f4903bb5, no revert commits), tally diff vs 2ce2f81f, then stop for my smoke test before Step 8."

---

## 14. Links

| Resource | URL |
|----------|-----|
| Upstream repo | https://github.com/ALwrity/ALwrity |
| Your fork | https://github.com/uniqueumesh/ALwrity |
| Upstream main commits | https://github.com/ALwrity/ALwrity/commits/main |
| Step 7 commit (known good) | https://github.com/uniqueumesh/ALwrity/commit/2ce2f81f |
| Phase 7 commit range (Steps 0–7) | https://github.com/uniqueumesh/ALwrity/compare/d322bfcd^...2ce2f81f |
| Recovery plan | [`../LOCAL_RECOVERY_PLAN_STEP7.md`](../LOCAL_RECOVERY_PLAN_STEP7.md) |
