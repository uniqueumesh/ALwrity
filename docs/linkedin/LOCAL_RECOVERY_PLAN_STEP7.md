# Local Recovery Plan — Return to Step 7 Working State

**Date:** 2026-06-21  
**Target commit:** [`2ce2f81f`](https://github.com/uniqueumesh/ALwrity/commit/2ce2f81f20c789013c19c56e2309ef574b6071fe) — *feat(linkedin): add Phase 7 profile optimization batch progression*  
**Goal:** Clean local files and runtime behavior matching the moment Step 7 manual tests passed.

---

## 1. What happened (simple timeline)

| Order | Event | Effect |
|-------|--------|--------|
| 1 | Step 7 implemented and pushed (`2ce2f81f`) | LinkedIn Writer worked locally |
| 2 | Step 8 tests added as **untracked** files | Did **not** change committed app code |
| 3 | Accidental **revert** of Step 7 (`02802726`) | Step 7 code removed from branch |
| 4 | Phase 6 Gemini fix attempted (uncommitted) | Confusion — not part of Step 7 commit |
| 5 | Recovery commits (`235887eb`, `5d227654`) | Step 7 code restored (same files as `2ce2f81f`) |
| 6 | Reset to `2ce2f81f` + `git clean` on untracked tests | Local back to exact Step 7 snapshot |

**Key insight:** Step 8 untracked tests never corrupted Step 7. The **revert commit** removed Step 7; everything after that was recovery noise.

---

## 2. Current state (as of this plan)

| Check | Status |
|-------|--------|
| Branch | `backup/step7-working-2026-06-21` |
| HEAD | `2ce2f81f` (exact Step 7 commit) |
| Working tree | Clean (no uncommitted changes) |
| Step 7 code on disk | Present (`advance_profile_optimization_batch`, batch routes, UI) |
| Remote feature branch | `feat/linkedin-topic-recommendations-collapse` at `5d227654` (same code, extra revert history) |

**You are already at the Step 7 code snapshot.** If the app still errors, the cause is likely runtime (stale servers, cache, DB) or a **separate Phase 6 issue** — not messy local files.

---

## 3. Safety nets (nothing is lost)

These branches/tags were created during recovery. **Do not delete them.**

| Backup | Points to | Use when |
|--------|-----------|----------|
| `backup/step7-working-2026-06-21` | `2ce2f81f` | Known-good Step 7 (recommended) |
| `backup/before-cleanup-2026-06-21` | Pre-cleanup state | If you need state before reset |
| `backup/revert-state-2026-06-21` | `02802726` | Accidental revert (broken Step 7) |
| `backup/step7-working` (tag) | `2ce2f81f` | Same as first row |
| `stash@{0}` | WIP topic fix | Optional — only if you need old WIP |

View all Phase 7 commits on GitHub:  
https://github.com/uniqueumesh/ALwrity/commits/feat/linkedin-topic-recommendations-collapse

Phase 7 commits only (Steps 0–7):  
https://github.com/uniqueumesh/ALwrity/compare/d322bfcd^...2ce2f81f

---

## 4. Recovery procedure (if you ever get messy again)

Run from repo root: `c:\alwrity-tool\ALwrity`

### Step A — Stop servers

Stop backend and frontend dev servers (Ctrl+C in their terminals).

### Step B — Inspect (read-only)

```powershell
cd c:\alwrity-tool\ALwrity
git status
git log --oneline -8
git branch -a
```

### Step C — Reset tracked files to Step 7

```powershell
git checkout backup/step7-working-2026-06-21
git reset --hard 2ce2f81f
```

This restores **exactly** the 9 files from the Step 7 push (routes, service, models, tests, frontend hook/API/components).

### Step D — Remove untracked clutter (preview first)

```powershell
# Preview — nothing deleted
git clean -fdn backend/tests/

# If list looks correct (only Step 8 leftovers), delete
git clean -fd backend/tests/
```

**Do not** run `git clean -fd` on the whole repo unless you intend to wipe all untracked files.

### Step E — Align with remote (optional)

Local `2ce2f81f` and remote `5d227654` have **identical code**. To match GitHub history:

```powershell
git checkout feat/linkedin-topic-recommendations-collapse
git pull origin feat/linkedin-topic-recommendations-collapse
```

Or stay on `backup/step7-working-2026-06-21` — same app code.

### Step F — Restart and verify

```powershell
# Backend
cd c:\alwrity-tool\ALwrity\backend
..\myenv\Scripts\python.exe -m pytest tests/services/integrations/linkedin/test_profile_optimization_service.py tests/api/test_linkedin_profile_route.py -v

# Then start backend + frontend as usual
```

### Step G — Manual Step 7 checklist

1. Open LinkedIn Writer — foundation loads without Phase 6/7 LLM on default load.
2. **Improve My Profile** → 5 optimization cards appear.
3. **Mark as done** / **Skip** → card disappears without full page reload.
4. When batch empty and backlog exists → **Get your next 5 recommendations** banner.
5. **Get Topic Ideas** still works (Phase 6 — see §5 if it fails).

---

## 5. Phase 6 error is NOT Step 7 breakage

If you see:

> Failed at Phase 6: Topic Recommendations (schema_validation)  
> List should have at least 5 items after validation, not 0

That is a **separate Gemini schema issue** in topic recommendations. It is **not** caused by Step 8 test files or Step 7 batch progression.

- Step 7 commit (`2ce2f81f`) does **not** include the Phase 6 Gemini fix.
- Fix Phase 6 in a **new commit after** Step 7 is stable — do not mix with recovery.

---

## 6. What NOT to do

| Action | Why avoid |
|--------|-----------|
| `git push --force` | Not needed; recovery used revert-of-revert |
| `git clean -fd` on entire repo | May delete wanted untracked docs/work |
| Delete backup branches | Your only rollback safety |
| Re-implement Step 7 from scratch | Code already exists at `2ce2f81f` |
| Panic-merge multiple fixes | One problem, one commit |

---

## 7. Recommended branch strategy going forward

1. **Work branch:** `feat/linkedin-topic-recommendations-collapse` (or stay on `backup/step7-working-2026-06-21` until confident).
2. **Before any risky git command:** `git branch backup/manual-$(Get-Date -Format yyyy-MM-dd-HHmm) HEAD`
3. **Step 8 redo:** New branch from Step 7, commit tests in one PR — never leave large untracked test trees on disk.
4. **One feature = one commit = manual test = push** (per your Phase 7 workflow).

---

## 8. Quick “am I OK?” checklist

```powershell
cd c:\alwrity-tool\ALwrity
git rev-parse HEAD          # should be 2ce2f81f... (or 5d227654 with same code)
git status                  # should be "nothing to commit, working tree clean"
git diff 2ce2f81f HEAD      # should be empty
```

If all three pass → **local files are in Step 7 working state.** Restart servers and test in browser.

---

## 9. If still broken after recovery

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Step 7 buttons missing | Wrong branch / not restarted | §4 Step C + F |
| Old UI in browser | Stale frontend build | Hard refresh (Ctrl+Shift+R) or restart `npm run dev` |
| Backend 404 on batch routes | Old backend process | Restart uvicorn |
| Phase 6 topic error | Gemini schema (pre-existing) | §5 — separate fix commit |
| Tests fail | Wrong Python env | Use `..\myenv\Scripts\python.exe` |

---

## 10. Summary

- **Working state = commit `2ce2f81f`.** Your local is already there.
- **Mess was git history + untracked Step 8 files**, not corrupted Step 7 code.
- **Recovery = checkout backup branch + hard reset + clean untracked tests + restart servers.**
- **Phase 6 failures are a different task** — handle after Step 7 is confirmed in browser.

When Step 7 manual tests pass again, say ready and we can redo Step 8 in a controlled, committed pass.
