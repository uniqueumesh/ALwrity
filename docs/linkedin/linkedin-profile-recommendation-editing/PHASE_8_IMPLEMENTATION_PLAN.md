# Phase 8 — Review, Regenerate & Apply Profile Drafts — Implementation Plan

## Document Information

| Field | Value |
|-------|-------|
| **Date** | 2026-06-21 |
| **Status** | **Planning — ready for implementation** |
| **Prerequisites** | Phase 7 complete + Step 8 gate passed (tests + manual E2E) |
| **Product spec** | [`LINKEDIN_PROFILE_OPTIMIZATION_RECOMMENDATION_PLAN.md`](./LINKEDIN_PROFILE_OPTIMIZATION_RECOMMENDATION_PLAN.md) §11 |
| **Phase 7 plan** | [`PHASE_7_IMPLEMENTATION_PLAN.md`](./PHASE_7_IMPLEMENTATION_PLAN.md) |
| **Pattern to mirror** | Phase 7 vertical slices + LinkedIn post publish UX + Blog Writer diff/publish modals |
| **External API** | [Unipile — Edit own profile (`PATCH /api/v1/users/me/edit`)](https://developer.unipile.com/reference/userscontroller_editaccountownerprofile) |

---

## 1. User Goals (this phase)

| # | Goal | Phase 8 deliverable |
|---|------|---------------------|
| G1 | After recommendations load, user can **review and edit** ready-made copy (`suggested_copy`) | Review & Edit modal with editable draft |
| G2 | If user dislikes the AI draft, they can **regenerate** a new one | Per-item regenerate (LLM), not full batch regen |
| G3 | After user **approves** the draft, they can **publish it to LinkedIn** from ALwrity | Apply via Unipile `PATCH /users/me/edit` |
| G4 | **Current Phase 7 behavior unchanged** | Existing cards, copy, mark done, skip, batch flow all keep working |

---

## 2. Gap Analysis — Implemented vs Needed

### 2.1 Already implemented (Phase 7 — do not break)

| Area | Status | Evidence |
|------|--------|----------|
| On-demand Phase 7 load | ✅ Done | `include_profile_optimization` / `refresh_profile_optimization` |
| 5-card batch + backlog | ✅ Done | `profile_optimization_service.py`, `next-batch` API |
| `suggested_copy` for headline/summary | ✅ Done | LLM prompt + validator + card display |
| Copy to clipboard | ✅ Done | `ProfileOptimizationCard.tsx` |
| Mark done / Skip | ✅ Done | `POST .../complete`, `useLinkedInProfileOptimization` |
| Expand/collapse card details | ✅ Done | `ProfileOptimizationCard.tsx` |
| Error + retry (`failed_phase: 7`) | ✅ Done | `useLinkedInProfileOptimization`, `AnalysisErrorAlert` |
| Persistence | ✅ Done | `profile_optimization_json` in `profile_repository.py` |
| Unipile read profile | ✅ Done | `unipile_client.fetch_own_linkedin_profile` |
| LinkedIn connection UX | ✅ Done | `useLinkedInSocialConnection`, connected profile card |

### 2.2 Not implemented (Phase 8 scope)

| Area | Status | Notes |
|------|--------|-------|
| Review / edit UI for draft copy | ❌ Missing | `suggested_copy` is read-only text |
| Regenerate single recommendation draft | ❌ Missing | Only full-batch regen via `refresh_profile_optimization` |
| User-approved draft persistence | ❌ Missing | No `approved_copy` / draft status on items |
| Unipile profile **write** | ❌ Missing | `unipile_client.py` is read/auth only; no `edit_own_profile` |
| Apply-to-profile API route | ❌ Missing | No `POST .../apply` endpoint |
| Publish preview + confirm modal | ❌ Missing | Product plan §11 UX not built |
| `can_apply_via_unipile` / `unipile_field_hint` | ❌ Missing | In product schema (§5) but not in Pydantic types or API |
| Phase 8 error surface (`failed_phase: 8`) | ❌ Missing | Apply failures need structured errors |
| Per-item regenerate LLM prompt | ❌ Missing | Phase 7 prompt is batch-only (5 items) |
| Post-apply profile refresh | ❌ Missing | Should re-run Phase 1 fetch + invalidate optimization hash |

### 2.3 Explicitly out of Phase 8 v1

| Item | Reason |
|------|--------|
| Auto-apply without user confirm | Trust / safety — always preview first |
| Apply for skills, experience, education, featured | Unipile nested fields complex; no `suggested_copy` today |
| Custom URL apply | Manual on LinkedIn (product spec §5) |
| Profile photo upload apply | Multipart + UX complexity — **Phase 8.1** stretch |
| Changing Phase 6 topic flow | Locked — no regression |
| Changing Phase 7 batch/LLM backlog logic | Extend only; do not rewrite service |

---

## 3. Phase 8 v1 Scope (locked for first release)

### 3.1 Apply-capable sections (v1)

| `profile_section` | Has `suggested_copy` today | Unipile write field | Phase 8 v1 |
|-------------------|---------------------------|---------------------|------------|
| `headline` | ✅ Required | `headline` | **Apply enabled** |
| `summary` | ✅ Required | `summary` | **Apply enabled** |
| `profile_photo` | ❌ (guidance only) | `picture` (multipart) | Guidance + copy only — defer apply to 8.1 |
| All other sections | ❌ empty string | Partial / nested | Keep Mark done + manual steps only |

**v1 rule:** **Review / Edit / Regenerate / Apply** appears only when `profile_section ∈ {headline, summary}` **and** `suggested_copy` is non-empty.

All other cards keep today’s UX exactly (View details, Copy, Mark done, Skip).

### 3.2 User flow (v1)

```
ProfileOptimizationCard (headline/summary + suggested_copy)
        │
        ▼
[ Review & Edit ]  ──►  ProfileOptimizationDraftModal
        │                 • Current text (from profile_context)
        │                 • Editable draft (starts as suggested_copy)
        │                 • Char limit hint (headline ~220)
        │                 • [ Regenerate draft ]  → single-item LLM
        │                 • [ Save draft ]        → persist approved_copy
        │                 • [ Apply to LinkedIn ] → confirm modal → Unipile PATCH
        │
        ▼ (optional, unchanged)
[ Mark as done ] / [ Skip ]  — still available; suggest Apply first for copy cards
```

After successful apply:
1. Re-fetch profile (Phase 1) for connected account
2. Update local profile context + invalidate optimization hash if headline/summary changed
3. Offer to mark recommendation done (auto-mark optional — **default: prompt user**)

---

## 4. Architecture — Extend, Do Not Replace

```
┌─────────────────────────────────────────────────────────────────┐
│  EXISTING (Phase 7 — unchanged semantics)                        │
│  rubric → LLM batch → validator → service → repo → GET /profile  │
│  ProfileOptimizationPanel → ProfileOptimizationCard              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ Phase 8 additions
┌─────────────────────────────────────────────────────────────────┐
│  profile_optimization_draft_service.py   (regenerate + approve)  │
│  profile_apply_service.py                (Unipile PATCH orchestr.) │
│  unipile_client.edit_own_profile()       (new low-level method)    │
│  POST .../regenerate  POST .../approve  POST .../apply             │
│  ProfileOptimizationDraftModal           (frontend)                │
│  ProfileApplyConfirmModal                (frontend — diff preview) │
└─────────────────────────────────────────────────────────────────┘
```

**Dependency rule:** Phase 8 modules call Phase 7 service/repository — never duplicate batch generation or rubric logic.

---

## 5. Locked Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| L1 | **Additive UI only** | Existing Mark done / Skip / batch CTAs stay |
| L2 | **v1 apply = headline + summary only** | Matches `suggested_copy` + simple Unipile fields |
| L3 | **Always preview before Unipile write** | Product spec §11 risks; reuse diff modal pattern |
| L4 | **Regenerate = single item, not full batch** | User goal; avoids burning 10–15 item backlog |
| L5 | **Store both `suggested_copy` and `approved_copy`** | Audit trail; regenerate updates `suggested_copy`, user edits → `approved_copy` |
| L6 | **`approved_copy` is what gets applied** | Apply button disabled until user saves/approves |
| L7 | **Phase 8 failures use `failed_phase: 8`** | Parallel to Phase 6/7 error pattern |
| L8 | **Reuse existing Unipile account_id from OAuth** | Same connection as profile read |
| L9 | **No new Gemini client** | Extend `profile_optimization_llm.py` with regenerate adapter |
| L10 | **Schema version bump to 2** | New optional fields on stored items + meta |

---

## 6. Data Model Extensions

### 6.1 Stored item fields (extend `ProfileOptimizationItem`)

```json
{
  "id": "uuid",
  "profile_section": "headline",
  "suggested_copy": "AI original draft",
  "approved_copy": "User-edited final draft",
  "draft_status": "suggested | edited | approved | applied",
  "can_apply_via_unipile": true,
  "unipile_field_hint": "headline",
  "regeneration_count": 0,
  "last_regenerated_at": "ISO8601|null",
  "applied_at": "ISO8601|null"
}
```

**Backward compatibility:** Items without new fields default to `draft_status: "suggested"`, `approved_copy: ""`, `can_apply_via_unipile` computed server-side from `profile_section`.

### 6.2 Meta block

Add optional `schema_version: 2` in `ProfileOptimizationMeta`. Reader accepts v1 payloads.

### 6.3 Repository

Extend `profile_repository.py` save/get — same column `profile_optimization_json`, no new DB migration if JSON blob only (mirror Phase 7 note).

---

## 7. Backend Module Plan

| Module | Action | Responsibility |
|--------|--------|----------------|
| `profile_optimization_types.py` | **Extend** | New fields, `schema_version=2`, apply eligibility helper |
| `profile_optimization_prompt.py` | **Extend** | `build_regenerate_draft_prompt(item, profile_context, feedback?)` |
| `profile_optimization_llm.py` | **Extend** | `call_regenerate_single_copy_llm()` — 1 item, lightweight schema |
| `profile_optimization_validator.py` | **Extend** | Validate single regenerated item; headline/summary length rules |
| `profile_optimization_draft_service.py` | **New** | Regenerate + save approved copy; update one item in stored payload |
| `profile_apply_service.py` | **New** | Map section → Unipile field; preflight; PATCH; post-fetch |
| `unipile_client.py` | **Extend** | `edit_own_profile(account_id, fields)` — multipart for future picture |
| `linkedin_social_routes.py` | **Extend** | 3 new POST routes (see §8) |
| `profile_service.py` | **Reuse** | Post-apply profile re-acquire |

### 7.1 Unipile apply mapping (v1)

| Section | PATCH body key | Validation |
|---------|----------------|------------|
| `headline` | `headline` | Max ~220 chars (LinkedIn limit) |
| `summary` | `summary` | Max ~2600 chars (conservative) |

Request shape (from Unipile docs):

```
PATCH /api/v1/users/me/edit
Content-Type: multipart/form-data
  type=LINKEDIN
  account_id={unipile_account_id}
  headline={approved_copy}   OR   summary={approved_copy}
```

### 7.2 Error handling (apply)

| Unipile / backend error | User message | `error_code` |
|-------------------------|--------------|--------------|
| 403 feature_not_subscribed | LinkedIn plan does not allow editing via API | `unipile_feature_not_subscribed` |
| 422 validation | Text too long or invalid for LinkedIn | `unipile_validation_failed` |
| 429 rate limit | Try again in a few minutes | `unipile_rate_limited` |
| Not connected | Connect LinkedIn first | `linkedin_not_connected` |
| Section not applyable | This recommendation must be updated manually on LinkedIn | `section_not_applyable` |

---

## 8. API Design

All routes under existing prefix `/api/linkedin-social/profile/optimization`.

### 8.1 Regenerate draft

```
POST /profile/optimization/{recommendation_id}/regenerate
Body: { "feedback": "optional string — e.g. shorter, more technical" }
Response: ProfileOptimizationBatchActionResponse (updated active batch)
```

- Loads stored item by id from active batch
- Validates section ∈ {headline, summary}
- Single LLM call; updates `suggested_copy`, increments `regeneration_count`
- Resets `draft_status` to `suggested`; clears `approved_copy`
- **Does not** call Unipile; **does not** advance batch

### 8.2 Save / approve draft

```
POST /profile/optimization/{recommendation_id}/approve
Body: { "approved_copy": "user edited text" }
Response: ProfileOptimizationBatchActionResponse
```

- Server validates length + section rules
- Sets `approved_copy`, `draft_status: "approved"`

### 8.3 Apply to LinkedIn

```
POST /profile/optimization/{recommendation_id}/apply
Body: { "confirm": true }
Response: ProfileOptimizationApplyResponse
```

```json
{
  "success": true,
  "applied_field": "headline",
  "applied_copy": "...",
  "profile_refresh_triggered": true,
  "profile_optimization": [ /* updated batch */ ],
  "profile_optimization_meta": { /* ... */ },
  "analysis_error": null
}
```

- Requires `draft_status === "approved"` and non-empty `approved_copy`
- Calls `profile_apply_service` → Unipile PATCH
- Triggers profile re-acquire for user (Phase 1)
- Sets `draft_status: "applied"`, `applied_at`
- Does **not** auto-advance batch (user can still Mark done)

### 8.4 GET `/profile` changes

- Response items include new optional fields (backward compatible)
- No new query flags required for Phase 8 v1

---

## 9. Frontend Plan

### 9.1 Reusable patterns (do not reinvent)

| Pattern | Source | Phase 8 use |
|---------|--------|-------------|
| Before/after diff preview | `frontend/src/components/TextEditor/DiffPreviewModal.tsx` (LinkedIn Writer) | Apply confirm: current profile text vs approved draft |
| Rich diff modal (MUI) | `frontend/src/components/BlogWriter/DiffPreviewModal/DiffPreviewModal.tsx` | Optional upgrade if section diff needs multi-block |
| Publish panel layout | `PublishLinkedInPanel.tsx` | Connection chip + disabled state when not connected |
| Publish card section | `BlogWriterUtils/PublishContent.tsx` | “Apply to LinkedIn” card styling |
| Error + retry | `AnalysisErrorAlert` + `useLinkedInProfileOptimization` | Extend for `failed_phase: 8` |
| API client patterns | `linkedinSocial.ts` | `regenerateProfileOptimizationDraft`, `approveProfileOptimizationDraft`, `applyProfileOptimizationDraft` |

### 9.2 New components (minimal set)

| Component | Purpose |
|-----------|---------|
| `ProfileOptimizationDraftModal.tsx` | Review/edit textarea, regenerate, save, apply entry |
| `ProfileApplyConfirmModal.tsx` | Final confirm with diff; calls apply API |

### 9.3 Changes to existing components (additive only)

| File | Change |
|------|--------|
| `ProfileOptimizationCard.tsx` | Add **Review & Edit** button when `can_apply_via_unipile && suggested_copy` |
| `useLinkedInProfileOptimization.ts` | Handlers for regenerate / approve / apply loading states |
| `LinkedInProfileSetupPanel.tsx` | Wire modal open state + Phase 8 errors |
| `linkedinSocial.ts` | Types + API functions + `failed_phase: 8` label |

**Do not remove:** Copy button, Mark done, Skip, expand/collapse, next-batch CTA.

### 9.4 Draft modal UX spec

```
┌────────────────────────────────────────────────────────────┐
│  Review headline draft                              [×]     │
├────────────────────────────────────────────────────────────┤
│  Current on LinkedIn          │  Your draft (editable)      │
│  ─────────────────────        │  ─────────────────────      │
│  Software Engineer at Acme    │  [ textarea ]               │
│                               │  142 / 220 characters       │
├────────────────────────────────────────────────────────────┤
│  [ Regenerate draft ]  [ Save draft ]  [ Apply to LinkedIn ] │
│                          (secondary)    (primary, disabled  │
│                                         until saved)        │
└────────────────────────────────────────────────────────────┘
```

- **Regenerate:** loading spinner on button; replaces textarea content on success
- **Save draft:** enables Apply; toast “Draft saved”
- **Apply:** opens confirm diff modal → on confirm calls apply API

---

## 10. Implementation Steps (vertical slices)

Each step has a **manual browser test gate** before the next step starts.

| Step | Title | Backend | Frontend | Manual test gate |
|------|-------|---------|----------|------------------|
| **0** | UI shell (disabled stubs) | None | Review & Edit button opens modal (read-only); Apply disabled | Button visible on headline/summary cards only |
| **1** | Approve draft persistence | `approve` route + draft service | Editable textarea + Save draft | Edit text → save → reload page → draft persists |
| **2** | Regenerate single draft | Regenerate prompt + LLM + route | Regenerate button live | Regenerate → new text; Save works |
| **3** | Unipile client + apply service | `edit_own_profile` + apply service | — | Unit test apply mapping (mock Unipile) |
| **4** | Apply API + confirm modal | `apply` route + post-fetch | Diff confirm + Apply live | Apply headline on staging test account |
| **5** | Post-apply refresh + hash | Wire Phase 1 re-fetch after apply | Success state + optional Mark done prompt | Edit on LinkedIn visible after refresh |
| **6** | Error hardening | Phase 8 error codes + logging | `failed_phase: 8` UI + retry | Break Unipile key → graceful error |
| **7** | Automated tests | Route + service + apply unit tests | Optional component tests | `pytest` green |
| **8** | E2E playbook | — | — | Full regression checklist (§11) |

**Demo milestone:** Step 4 — first apply from ALwrity to live LinkedIn profile.

---

## 11. Manual Testing Playbook (Phase 8)

Run on staging with a test LinkedIn account.

| # | Scenario | Pass criteria |
|---|----------|---------------|
| 1 | Phase 7 regression | Improve My Profile, batch, mark done, skip — unchanged |
| 2 | Non-copy cards | Experience/skills cards — **no** Review & Edit button |
| 3 | Open Review & Edit | Headline card shows current vs draft |
| 4 | Edit + Save | Custom text persists after refresh |
| 5 | Regenerate | New AI draft replaces textarea |
| 6 | Regenerate + Save | Approved copy is regenerated text or user edits |
| 7 | Apply headline | LinkedIn profile shows new headline |
| 8 | Apply summary | About section updated |
| 9 | Apply without save | Apply disabled until Save |
| 10 | Not connected | Apply shows connect message |
| 11 | Phase 6 regression | Get Topic Ideas still works |
| 12 | Error retry | Failed apply → retry succeeds |
| 13 | Hash invalidation | After apply + refresh, optimization can regen if needed |

---

## 12. Suggested PR Sequence

| PR | Steps | Title suggestion |
|----|-------|------------------|
| PR-1 | 0–1 | `feat(linkedin): Phase 8 draft review modal + approve persistence` |
| PR-2 | 2 | `feat(linkedin): Phase 8 regenerate single optimization draft` |
| PR-3 | 3–4 | `feat(linkedin): Phase 8 apply profile draft via Unipile` |
| PR-4 | 5–6 | `feat(linkedin): Phase 8 post-apply refresh and error UX` |
| PR-5 | 7–8 | `test(linkedin): Phase 8 automated tests + E2E hardening` |

---

## 13. Test Matrix (Step 7)

| Layer | File (proposed) |
|-------|-----------------|
| Draft service | `test_profile_optimization_draft_service.py` |
| Apply service | `test_profile_apply_service.py` |
| Unipile client | `test_unipile_edit_profile.py` (mock httpx) |
| API routes | extend `test_linkedin_profile_route.py` |
| Validator | extend `test_profile_optimization_validator.py` (length rules) |

---

## 14. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| User applies wrong text | Mandatory diff confirm modal |
| Unipile 403 on some accounts | Clear message + fallback “Copy and paste on LinkedIn” |
| Regenerate cost / latency | Rate limit per item (e.g. max 3 regenerations per card) |
| Stale `current_state_summary` after apply | Phase 1 re-fetch + optional card refresh |
| Breaking Phase 7 stored JSON | Schema version + defaults on read |
| Headline length rejected by LinkedIn | Server-side char count + validator |

---

## 15. Phase 8.1 (future, not v1)

- Profile photo apply (`picture` multipart upload)
- Regenerate with optional user feedback textarea
- Experience bullet apply (nested Unipile fields)
- Auto mark done after successful apply (product toggle)

---

## 16. Definition of Done (Phase 8)

Phase 8 is **complete** when:

1. Headline and summary cards support Review → Edit → Regenerate → Approve → Apply
2. Apply updates live LinkedIn profile via Unipile on staging
3. All Phase 7 + Phase 6 manual regressions pass
4. Backend tests pass for draft + apply + routes
5. Product sign-off on confirm modal copy and button labels

---

## 17. References

- [`LINKEDIN_PROFILE_OPTIMIZATION_RECOMMENDATION_PLAN.md`](./LINKEDIN_PROFILE_OPTIMIZATION_RECOMMENDATION_PLAN.md) — §5 schema, §11 Phase 8
- [`PHASE_7_IMPLEMENTATION_PLAN.md`](./PHASE_7_IMPLEMENTATION_PLAN.md) — architecture to extend
- [`PHASE_7_STEP_8_GUIDE.md`](./PHASE_7_STEP_8_GUIDE.md) — prerequisite gate
- [`backend/services/integrations/linkedin/profile_optimization_service.py`](../../../backend/services/integrations/linkedin/profile_optimization_service.py)
- [`frontend/src/components/LinkedInWriter/components/ProfileOptimization/ProfileOptimizationCard.tsx`](../../../frontend/src/components/LinkedInWriter/components/ProfileOptimization/ProfileOptimizationCard.tsx)
- [Unipile Edit own profile](https://developer.unipile.com/reference/userscontroller_editaccountownerprofile)

---

**Next step:** Implement **Step 0** (Review & Edit modal shell on headline/summary cards only) in a new branch from updated `main` after Phase 7 merge.
