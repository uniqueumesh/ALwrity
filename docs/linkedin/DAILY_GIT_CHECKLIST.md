# Daily Git Checklist — Stay Synced With ALwrity Team

## Document Information

| Field | Value |
|-------|-------|
| **Date** | 2026-06-20 |
| **Purpose** | Quick routine so local `main` matches `ALwrity/main` and feature work stays clean |
| **Remotes** | `upstream` = `ALwrity/ALwrity` · `origin` = your fork |

---

## Before You Start Coding (2 minutes)

```powershell
cd c:\alwrity-tool\ALwrity

git fetch upstream
git checkout main
git pull upstream main
git push origin main
```

**Pass if:** `git status` shows *on branch main*, *up to date*, *clean*.

**GitHub fork UI:** If your fork shows *“X commits behind ALwrity/main”*, run the commands above, or click **Sync fork** on GitHub after `git push origin main`.

---

## Starting New Work

**Never code on `main`.** Always branch from fresh team code:

```powershell
git fetch upstream
git checkout -b feat/your-feature-name upstream/main
```

Examples: `feat/linkedin-phase-7`, `feat/linkedin-analytics-ui`

---

## While a PR Is Open

Stay on your feature branch. If team merges to `main` while you work:

```powershell
git fetch upstream
git checkout feat/your-feature-name
git rebase upstream/main
git push origin feat/your-feature-name --force-with-lease
```

Before push, run your manual test (LinkedIn connect + Topic Suggestion).

---

## Backend Startup (LinkedIn dev)

Use the team README command — not `uvicorn main:app`:

```powershell
cd backend
python start_alwrity_backend.py
```

Your `backend/.env` may have `ALWRITY_ENABLED_FEATURES=linkedin` — that is local only; never commit `.env`.

---

## End of Day (30 seconds)

```powershell
git status
git push origin HEAD
```

**Pass if:** no surprise uncommitted files; feature branch pushed to your fork.

---

## After Your PR Merges

```powershell
git checkout main
git pull upstream main
git push origin main
git branch -d feat/your-feature-name
```

Optional — delete old safety branches only **after** you are sure you do not need them:

- `backup/pr729-full-work-2026-06-20`
- `feature/linkedin-analytics-landing`

---

## Never Commit

| Item | Why |
|------|-----|
| `backend/.env`, `frontend/.env` | Secrets |
| `workspace/` | Personal user DBs |
| `myenv/` | Virtual environment |
| `__pycache__/`, `*.pyc` | Generated |
| `ngrok.exe` | Local dev tool |

---

## Quick Sanity Checks

| Question | Good answer |
|----------|-------------|
| Which branch am I on? | `main` for sync only; `feat/*` for coding |
| Does `main` match team? | `git rev-parse main` = `git rev-parse upstream/main` |
| How big is my PR? | `git diff --name-only upstream/main...HEAD` — LinkedIn PR should stay ~75–85 files, not 100+ |
| Is my work backed up? | Pushed to `origin`; old full backup on `backup/pr729-full-work-2026-06-20` if needed |

---

## Emergency Undo (lost or broken branch)

```powershell
git checkout refs/heads/backup/pr729-full-work-2026-06-20
```

Or restore files from `c:\alwrity-tool\ALwrity-LINKEDIN-BACKUP-2026-06-20\` (disk backup from recovery).

---

## One-Line Rule

> **Fetch upstream → update `main` → branch from `main` → push feature branch → open small focused PRs.**

---

## Related Docs

- [`archive/recovery-2026-06/PR_729_BRANCH_RECOVERY_PLAN.md`](./archive/recovery-2026-06/PR_729_BRANCH_RECOVERY_PLAN.md) — historical: PR #729 recovery
- [`POST_MERGE_CLEANUP_PLAN.md`](./POST_MERGE_CLEANUP_PLAN.md) — post-merge cleanup checklist
- [`unipile/PULL_REQUEST_TEMPLATE.md`](./unipile/PULL_REQUEST_TEMPLATE.md) — PR description template for LinkedIn work
