# Phase 6 UX — Collapsible Topic Recommendations List

## Document Information

| Field | Value |
|-------|-------|
| **Date** | 2026-06-21 |
| **Status** | Implementation done · Git sync + PR pending |
| **Type** | Phase 6 UX polish (pre–Phase 7) |
| **Scope** | Frontend only — hide/show the 5 topic cards without losing data |
| **Out of scope** | Backend API changes, re-fetch on expand, Phase 7 profile optimization |
| **Feature branch** | `feat/linkedin-topic-recommendations-collapse` |
| **Team main (target)** | `upstream/main` @ `86b0b5d4` (persona Phase 3–4; ahead of local `main` @ `f74ffd13`) |

---

## 1. Problem (What You Reported)

After clicking **Topic Suggestion**, five topic cards appear in **"What to write next"**. They stay **fully open** with no way to:

- Collapse the list to free screen space
- Hide it while you write in the LinkedIn Writer
- Open it again later **without re-running** the full analysis

The topics are useful, but the UI treats them as **always visible** once generated.

---

## 2. Goal (Simple)

Give the user a **Hide / Show** control on the topic list:

| State | What user sees |
|-------|----------------|
| **Expanded** (today) | Full panel + 5 cards |
| **Collapsed** | Small summary bar: *"5 topic ideas · Updated 5 hours ago"* + **Show** button |
| **Show again** | Same 5 topics instantly — **no new API call** |

Topics stay in memory until the user clicks **Topic Suggestion** again or refreshes the page.

---

## 3. Why This Happens Today (Root Cause)

Current flow in code:

```
Topic Suggestion clicked
        ↓
analysisState = 'complete'
        ↓
TopicRecommendationsPanel always renders all cards
        ↓
No isCollapsed / isVisible state exists
```

Relevant files today:

| File | Role |
|------|------|
| `LinkedInProfileSetupPanel.tsx` | Shows panel when `analysisState === 'complete'` |
| `TopicRecommendationsPanel.tsx` | Renders header + 5 cards — **always expanded** |
| `useLinkedInProfileCompletion.ts` | Holds `recommendations` in React state — data is already there to re-show |

**Nothing is broken** — we simply never built the collapse UI.

---

## 4. Recommended UX Design

### 4.1 Collapsed summary bar (default after user hides)

When user clicks **Hide topics**:

```
┌─────────────────────────────────────────────────────────┐
│  What to write next          [Show topics ▼]  [Refresh] │
│  5 ideas · Updated 5 hours ago                          │
└─────────────────────────────────────────────────────────┘
```

- **Show topics** — expands the list (instant, from memory)
- **Refresh** (optional, secondary) — re-runs Topic Suggestion API for new ideas
- Connected profile card stays visible above (unchanged)

### 4.2 Expanded panel (current behavior + hide control)

Add to the existing header row:

```
What to write next                    [Hide ▲]
Five ideas tailored to your profile
Updated 5 hours ago

[ Card 1 ]
[ Card 2 ]
...
```

### 4.3 Button labels (consistent copy)

| Action | Label |
|--------|-------|
| Collapse list | **Hide topics** |
| Expand list | **Show topics** |
| New analysis | **Get new ideas** (optional — calls existing `runTopicAnalysis`) |

Use LinkedIn blue / subtle text button style to match existing panel.

---

## 5. Implementation Plan (Frontend Only)

### Step 1 — Add collapse state to the hook

**File:** `frontend/src/hooks/useLinkedInProfileCompletion.ts`

| Add | Purpose |
|-----|---------|
| `isRecommendationsExpanded: boolean` | Default `true` after first successful load |
| `collapseRecommendations()` | Sets expanded → `false` |
| `expandRecommendations()` | Sets expanded → `true` |

**Rules:**

- When `runTopicAnalysis()` **starts** → keep or reset expanded to `true` (user expects to see new results)
- When analysis **completes with 5 cards** → expanded `true`
- When user clicks **Hide** → expanded `false`; **`recommendations` array unchanged**
- On **error** → stay expanded so error + Retry remain visible

**Optional (nice):** persist `isRecommendationsExpanded` in `sessionStorage` keyed by user id so hide survives page refresh within the same browser session. **Not required for v1.**

---

### Step 2 — Pass state into the panel

**File:** `LinkedInProfileSetupPanel.tsx`

Wire hook outputs into `TopicRecommendationsPanel`:

```text
isExpanded={isRecommendationsExpanded}
onCollapse={collapseRecommendations}
onExpand={expandRecommendations}
onRefresh={runTopicAnalysis}   // optional "Get new ideas"
```

Panel still renders when `analysisState === 'complete'` — only **inner content** collapses.

---

### Step 3 — Update `TopicRecommendationsPanel` UI

**File:** `TopicRecommendationsPanel.tsx`

| Mode | Render |
|------|--------|
| `isExpanded === true` | Current full list + **Hide topics** in header |
| `isExpanded === false` | Compact summary bar only (no cards) |
| `isRefreshing === true` | Show skeleton **only if expanded**; if collapsed, show small "Updating…" on summary bar |

**Accessibility:**

- Toggle buttons: `aria-expanded={isExpanded}`, `aria-controls="topic-recommendations-list"`
- Card list container: `id="topic-recommendations-list"`

---

### Step 4 — Collapsed summary component (small new file or inline)

**Optional new file:** `TopicRecommendationsSummaryBar.tsx`

Keeps `TopicRecommendationsPanel.tsx` readable. Shows:

- Title: "What to write next"
- Subtitle: `{count} ideas · {updatedLabel}`
- Buttons: Show topics, optional Get new ideas

---

### Step 5 — Manual test checklist

| # | Test | Pass if |
|---|------|---------|
| 1 | Generate 5 topics | List expands as today |
| 2 | Click **Hide topics** | Cards disappear; summary bar remains |
| 3 | Click **Show topics** | Same 5 cards return instantly (no loading spinner) |
| 4 | Hide → write in editor | Writer area has more space |
| 5 | Click **Topic Suggestion** again (or Get new ideas) | New run; list auto-expands with new/ cached topics |
| 6 | Error state | Panel stays expanded; Retry visible |
| 7 | Running state while expanded | Skeleton shows |
| 8 | Disconnect LinkedIn | State resets on reconnect (existing behavior) |

---

## 6. Files to Change (Summary)

| File | Change |
|------|--------|
| `useLinkedInProfileCompletion.ts` | Add expand/collapse state + actions |
| `LinkedInProfileSetupPanel.tsx` | Pass new props |
| `TopicRecommendationsPanel.tsx` | Collapsed vs expanded layout + header buttons |
| `TopicRecommendationsSummaryBar.tsx` | **New** (optional) — collapsed bar UI |

**No backend changes.**  
**No API contract changes.**  
**No database changes.**

---

## 7. What We Are NOT Doing (Important)

| Not in this task | Why |
|------------------|-----|
| Delete topics on hide | User wants them for later — data stays in state |
| Auto-collapse on navigation | Explicit user action only |
| Phase 7 "Improve My Profile" | Separate feature |
| Persist topics to localStorage long-term | Backend cache already stores them; session-only optional |
| Change Topic Suggestion button location | Intro card already hidden when `complete` — optional follow-up: show compact "Get new ideas" in summary bar |

---

## 8. Optional Follow-Up (After This UX Fix)

These align with **Phase 7 Step 0** but are **separate tasks**:

1. **Re-show Topic Suggestion entry** when collapsed — small link to run fresh analysis without expanding first
2. **Pipeline split** — foundation load on mount, Phase 6 only on button click (see Phase 7 plan)
3. **Remember collapse** across refresh via `sessionStorage`

Implement collapse **first** — small, safe, fixes your immediate UX pain.

---

## 9. Estimated Effort

| Step | Time |
|------|------|
| Hook state | 30 min |
| Panel UI + summary bar | 1–2 hours |
| Manual testing | 30 min |
| **Total** | **~2–3 hours** |

---

## 10. One-Line Summary

> Add **Hide topics / Show topics** toggle in the Phase 6 panel — collapse is UI-only; the five recommendations stay in React state until the user asks for new ones.

---

## 11. Git Workflow — Sync Team Main, Tally, Test, PR

Use this **after** collapse code is written locally. Goal: keep the collapse commit **separate** from `main` until rebased on latest team code, tested, and merged via PR.

**Remotes:** `upstream` = `ALwrity/ALwrity` · `origin` = your fork (`uniqueumesh/ALwrity`)

**Rule:** Never commit feature work directly on `main`. `main` stays a clean mirror of team code.

### 11.1 Workflow overview

```
Local collapse changes (uncommitted on main)
        ↓
Phase A — Commit on feature branch + push to fork
        ↓
Phase B — Update local main + fork main from upstream
        ↓
Phase C — Rebase feature branch onto latest upstream/main (tally)
        ↓
Phase D — Manual test LinkedIn Writer
        ↓
Phase E — Push feature branch + open PR to ALwrity/main
        ↓
Phase F — After PR merges → sync your fork main again
```

---

### Phase A — Isolate collapse commit (do this first)

**When:** You have uncommitted collapse files on `main`.

**Files in this commit:**

| File | Change |
|------|--------|
| `frontend/src/hooks/useLinkedInProfileCompletion.ts` | Expand/collapse state + actions |
| `frontend/src/components/LinkedInWriter/components/ProfileCompletion/LinkedInProfileSetupPanel.tsx` | Wire props |
| `frontend/src/components/LinkedInWriter/components/TopicRecommendations/TopicRecommendationsPanel.tsx` | Collapsed vs expanded UI |
| `frontend/src/components/LinkedInWriter/components/TopicRecommendations/TopicRecommendationsSummaryBar.tsx` | **New** — summary bar |

**Commands:**

```powershell
cd c:\alwrity-tool\ALwrity

git checkout -b feat/linkedin-topic-recommendations-collapse

git add frontend/src/hooks/useLinkedInProfileCompletion.ts `
  frontend/src/components/LinkedInWriter/components/ProfileCompletion/LinkedInProfileSetupPanel.tsx `
  frontend/src/components/LinkedInWriter/components/TopicRecommendations/TopicRecommendationsPanel.tsx `
  frontend/src/components/LinkedInWriter/components/TopicRecommendations/TopicRecommendationsSummaryBar.tsx

git commit -m "feat(linkedin): add collapsible topic recommendations panel"

git push -u origin feat/linkedin-topic-recommendations-collapse
```

**Pass if:**

- `git log -1 --oneline` on feature branch shows the collapse commit only (on top of old `main`)
- `git status` is clean on the feature branch
- Branch exists on `origin`

**Do not merge this into `main` yet.**

---

### Phase B — Update local `main` and fork `main`

**When:** Collapse work is safely on the feature branch.

**Commands:**

```powershell
git checkout main
git fetch upstream
git pull upstream main
git push origin main
```

**Pass if:**

| Check | Expected |
|-------|----------|
| `git rev-parse main` | Same as `git rev-parse upstream/main` (`86b0b5d4` or newer) |
| `git status` on `main` | Clean working tree |
| GitHub fork | No longer “behind ALwrity/main” |

Your local and fork `main` now match team code **without** the collapse commit.

---

### Phase C — Tally collapse vs latest team main

**When:** Phase B is complete.

**Commands:**

```powershell
git checkout feat/linkedin-topic-recommendations-collapse
git fetch upstream
git rebase upstream/main
```

If rebase conflicts appear, fix files, then:

```powershell
git add <resolved-files>
git rebase --continue
```

**Review what you are shipping:**

```powershell
git log upstream/main..HEAD --oneline
git diff upstream/main...HEAD --name-only
git diff upstream/main...HEAD --stat
```

**Tally checklist:**

| # | Check | Pass if |
|---|-------|---------|
| 1 | Commit count | Exactly **1** commit ahead of `upstream/main` (collapse only) |
| 2 | File list | Only the 4 frontend files listed in Phase A |
| 3 | No persona conflicts | Rebase did not accidentally drop LinkedIn or persona changes |
| 4 | Diff size | Small UX-only diff (~200 lines), not 100+ files |

After a clean rebase, push the rebased branch:

```powershell
git push origin feat/linkedin-topic-recommendations-collapse --force-with-lease
```

---

### Phase D — Manual test (required before PR)

**When:** Phase C rebase is clean and pushed.

**Backend:**

```powershell
cd c:\alwrity-tool\ALwrity\backend
python start_alwrity_backend.py
```

Use `ALWRITY_ENABLED_FEATURES=linkedin` in `backend/.env` (local only — never commit).

**Frontend:** run as you normally do for LinkedIn dev.

**Test matrix** (Section 5 checklist + sync sanity):

| # | Test | Pass if |
|---|------|---------|
| 1 | Connect LinkedIn | OAuth completes; popup closes |
| 2 | Topic Suggestion | 5 cards appear expanded |
| 3 | Hide topics | Summary bar only; cards hidden |
| 4 | Show topics | Same 5 cards instantly; no API reload |
| 5 | Get new ideas | Re-runs analysis; list expands |
| 6 | Error / Retry | Panel stays expanded on error |
| 7 | App loads on latest main | No console errors from persona Phase 3–4 + LinkedIn together |

**If tests fail:** fix on the feature branch, commit, re-run Phase D. Do not open PR until all rows pass.

---

### Phase E — Push final commit and open PR

**When:** Phase D passes.

**1. Ensure feature branch is pushed:**

```powershell
git checkout feat/linkedin-topic-recommendations-collapse
git push origin feat/linkedin-topic-recommendations-collapse
```

**2. Open PR** from `uniqueumesh/ALwrity` → `feat/linkedin-topic-recommendations-collapse` **into** `ALwrity/ALwrity` → `main`.

Use [`PULL_REQUEST_TEMPLATE.md`](../unipile/PULL_REQUEST_TEMPLATE.md).

**Suggested PR title:**

```text
feat(linkedin): collapsible topic recommendations panel (Phase 6 UX)
```

**PR body should include:**

- Summary: Hide/Show topics; no re-fetch on expand; Get new ideas re-runs analysis
- Scope: frontend only, 4 files
- Manual test: checklist from Phase D
- Link to this plan doc (local reference)

**Pass if:**

- PR shows **1 commit**, **~4 files changed**
- CI green (if applicable)
- No `.env`, `workspace/`, or unrelated files in the diff

**Do not merge locally into your `main` before the team merges the PR.** The PR is the review path.

---

### Phase F — After PR merges (sync your fork `main`)

**When:** PR is merged on `ALwrity/main`.

```powershell
git checkout main
git fetch upstream
git pull upstream main
git push origin main
```

Optional cleanup:

```powershell
git branch -d feat/linkedin-topic-recommendations-collapse
git push origin --delete feat/linkedin-topic-recommendations-collapse
```

**Pass if:** `main`, `upstream/main`, and `origin/main` all point to the same commit (team main **including** your merged collapse work).

---

### 11.2 Branch map (during this work)

| Branch | Contents |
|--------|----------|
| `main` (local + origin) | Clean team code only — updated in Phase B, again in Phase F |
| `feat/linkedin-topic-recommendations-collapse` | Single collapse commit — rebased in Phase C, PR in Phase E |
| `feature/linkedin-analytics-landing` | Unrelated old work — leave untouched |

---

### 11.3 What not to do

| Avoid | Why |
|-------|-----|
| Commit collapse directly on `main` | Mixes feature with sync; hard to PR cleanly |
| `git push --force` on `main` | Dangerous; use normal pull/push only |
| Skip rebase before PR | PR may include wrong base or conflict with persona changes |
| Open PR before manual test | Regressions reach team review |
| Commit `.env` or `workspace/` | Secrets and local DBs |

---

### 11.4 Quick status tracker

| Phase | Task | Status |
|-------|------|--------|
| A | Collapse commit on feature branch | ☑ |
| B | Sync local + fork `main` from `upstream` | ☐ |
| C | Rebase + tally diff | ☐ |
| D | Manual LinkedIn test | ☐ |
| E | Push + open PR to `ALwrity/main` | ☐ |
| F | After merge — sync fork `main` | ☐ |

---

## Related Documents

- [DAILY_GIT_CHECKLIST.md](../DAILY_GIT_CHECKLIST.md) — daily upstream sync routine
- [PHASE_7_IMPLEMENTATION_PLAN.md](../linkedin-profile-recommendation-editing/PHASE_7_IMPLEMENTATION_PLAN.md) — next major feature (Step 0 pipeline split)
- [Phase 6 spec](./Phase%206%20-%20Personalized%20Content%20Recommendation%20Engine.md) — original Phase 6 behavior
- [PULL_REQUEST_TEMPLATE.md](../unipile/PULL_REQUEST_TEMPLATE.md) — use for PR when implementing
