# LinkedIn Personal Profile Publishing via Unipile

## Goal (v1 — this slice)

When an end user finishes generating content in the ALwrity LinkedIn Writer and clicks **Publish to LinkedIn**, ALwrity must publish the **generated draft text** to the user's **connected LinkedIn personal profile** via Unipile.

**In scope for v1**

- Text-only post (`POST /api/v1/posts` with `account_id` + `text`)
- Personal profile only (stored `unipile_account_id`)
- Connected-user auth + existing Unipile connection flow

**Out of scope for v1 (do not implement yet)**

- First comment (UI exists but must not be sent or published)
- Link-in-first-comment / URL stripping from post body
- Media (images, video, attachments)
- Organization / company-page posting (`as_organization`)
- Scheduling, reposts, mentions, external-link preview cards
- Analytics changes

Primary Unipile references:

- [Create a post](https://developer.unipile.com/reference/postscontroller_createpost) — `POST /api/v1/posts`, required body: `account_id`, `text`
- [Posts and Comments](https://developer.unipile.com/docs/posts-and-comments) — comment APIs use post `social_id`; **not needed for v1**

---

## Current State Audit (code recheck)

### Already done ✅

| Area | File(s) | Status |
|------|---------|--------|
| Unipile connect / disconnect | `unipile_client.py`, `unipile_provider.py`, `linkedin_oauth.py` | Working |
| Connection status + accounts UI | `linkedin_social_routes.py`, `linkedinSocial.ts`, `useLinkedInSocialConnection.ts` | Working |
| Profile pipeline (acquire → optimization) | `profile_service.py`, profile routes | Working |
| Content generation (LinkedIn Writer) | `LinkedInWriter.tsx`, writer API | Working |
| Publish panel shell | `PublishLinkedInPanel.tsx` | Renders Connected state + button |
| Provider-neutral publish types | `types.py` — `CreatePostRequest`, `CreatePostResult` | Defined |
| Provider protocol | `protocol.py` — `create_post()` | Defined |
| Pre-publish guards (duplicate + media) | `publish_preflight.py`, `content_deduplicator.py` | Implemented (media skipped when `media_urls` empty) |
| Writer content source (`draft`) | `useLinkedInWriter.ts`, `ContentEditor.tsx`, `LinkedInWriter.tsx` | Preview + Save to Asset Library use `draft` |
| First-comment payload helpers (publish prep only, not displayed) | `firstCommentUtils.ts`, `previewPayload` in `PublishLinkedInPanel.tsx` | Built for Phase 2; **must not be used in v1 publish call** |

### Not done yet ❌ (blocks the Publish button)

| Area | File(s) | Gap |
|------|---------|-----|
| Unipile HTTP create post | `unipile_client.py` | No `create_post()` method |
| Provider publish logic | `unipile_provider.py` | `create_post()` raises `NotImplementedError` |
| Publish API route | `linkedin_social_routes.py` | No `POST /api/linkedin-social/posts/publish` |
| Publish request/response models | `linkedin_social_models.py` | No publish models |
| Frontend API client | `linkedinSocial.ts` | No `publishLinkedInPost()` |
| Button wiring | `PublishLinkedInPanel.tsx` | Button has **no `onClick`**; tooltip says "Publishing ships in Phase 2" |
| End-to-end publish | — | Clicking Publish does nothing today |

### Ahead-of-implementation tests ⚠️

These test files expect publish code that is **not in the repo yet** and assume first-comment behavior:

- `backend/tests/test_linkedin_unipile_publish.py` — expects `UnipileClient.create_post`, `create_post_comment`, and provider partial-success on comment failure
- `backend/tests/api/test_linkedin_publish_route.py` — expects `publish_linkedin_post` route and `first_comment_status`

**Plan:** implement v1 text-only publish first, then **update tests** to match v1 (remove comment expectations; add text-only success/failure cases). Comment tests can move to a future "Phase 2 — first comment" doc.

---

## Content source of truth (answer to draft vs previewPayload)

The LinkedIn Writer already has a single source of truth for what the user sees. Publish must use that same source — not a transformed copy.

| Variable | Where it lives | Used for display? | Used for publish today? |
|----------|----------------|-------------------|-------------------------|
| **`draft`** | `useLinkedInWriter` state → `LinkedInWriter.tsx` → `ContentEditor` / `ContentDisplayArea` | **Yes** — this is the post shown in the preview pane | No (button not wired) |
| **`previewPayload`** | `PublishLinkedInPanel.tsx` via `buildPublishPayload(draft, firstComment, moveLinksEnabled)` | **No** — never rendered in the UI | Only `canPublish` check (`previewPayload.content.trim()`) |
| **`buildPublishPayload()`** | `firstCommentUtils.ts` | **No** | Prepares a *different* body when "Move links to first comment" is checked: strips URLs, adds "Link in first comment 👇", puts URL in `first_comment` |

**What the end user sees** (your screenshot) is always raw **`draft`** — the same string passed to:

- `ContentDisplayArea` (preview)
- `Save to Asset Library` (`LinkedInWriter.tsx` uses `content: draft`)
- `PublishLinkedInPanel` as the `draft` prop

**`previewPayload.content` is not what is shown.** With "Move links to first comment" checked (default), `previewPayload.content` can differ from `draft` (URL removed, suffix added). Using it for v1 publish would post text the user did **not** see in the preview.

**v1 decision:** Publish **`draft`** as-is — the exact generated/edited post in the writer. Do **not** use `previewPayload.content` or `buildPublishPayload()` for the publish API call. This reuses the existing writer flow; no new draft logic is needed.

**Small consistency fix during implementation:** Change `canPublish` from `previewPayload.content.trim()` to `draft.trim()` so the button enable rule matches what will actually be published.

First-comment UI (`buildPublishPayload`, checkbox, link field) stays in the panel for a future phase but must not affect v1 publish payload.

---

## v1 Publish Flow (target)

```
LinkedIn Writer draft (string)          ← same text as preview + Save to Asset Library
  → PublishLinkedInPanel: user clicks Publish
  → publishLinkedInPost({ content: draft.trim() })
  → POST /api/linkedin-social/posts/publish  { content: draft }
  → resolve_credentials → unipile_account_id
  → run_publish_preflight (duplicate check only for text-only)
  → UnipileProvider.create_post()
  → UnipileClient.create_post(account_id, text)
  → POST https://{UNIPILE_DSN}/api/v1/posts
  → 201 → return post_id / social_id to UI
```

**Important:** `text` sent to Unipile = **`draft`**. No URL stripping, no first comment, no `buildPublishPayload()` transformation.

---

## Implementation Plan

### 1. Backend — `UnipileClient` (`unipile_client.py`)

Add one method only for v1:

```python
async def create_post(self, account_id: str, text: str) -> dict[str, Any]
```

- **Endpoint:** `POST /api/v1/posts`
- **JSON body:** `{ "account_id": account_id, "text": text }`
- **Do not send:** `attachments`, `external_link`, `as_organization`, `mentions`, `repost`, `video_thumbnail`
- **Headers:** existing `X-API-KEY` pattern
- **Success:** HTTP 201 — parse JSON; return raw dict
- **Errors:** raise `UnipileAPIError` with status + safe message (existing pattern)
- **Logging:** account_id, content length, status, post `id` / `social_id` — never log full text or API key

**Deferred:** `create_post_comment()` — not in v1.

### 2. Backend — `UnipileProvider.create_post()` (`unipile_provider.py`)

Replace the `NotImplementedError` stub with:

1. Resolve credentials via `LinkedInOAuthService.resolve_credentials(user_id)`
2. Require `provider_mode == "unipile"` and non-empty `unipile_account_id`
3. Use stored `unipile_account_id` as publish account; reject if `request.account_id` is present and mismatched
4. Reject `request.organization_urn` / org targets with clear validation error (personal profile only)
5. Trim `request.content`; reject empty string before Unipile call
6. Call `run_publish_preflight(user_id, request, db=...)` — safe for text-only (`media_urls` empty)
7. Call `self._client.create_post(account_id, text)`
8. Map response to `CreatePostResult`:
   - `success=True`
   - `post_id` ← response `id`
   - `post_urn` ← response `social_id` (fallback: `urn`, then `id`)
   - `raw` ← full Unipile JSON

**Do not** read or publish `request.first_comment` in v1.

### 3. Backend — API route (`linkedin_social_routes.py`)

Add:

- **Endpoint:** `POST /api/linkedin-social/posts/publish`
- **Auth:** `get_current_user` (existing)
- **Request model** (`LinkedInPublishPostRequest`):
  - `content: str` (required)
  - `account_id: Optional[str]` (optional; must match stored account if sent)
- **Response model** (`LinkedInPublishPostResponse`):
  - `success: bool`
  - `post_id: Optional[str]`
  - `post_urn: Optional[str]`
  - `provider: str`
  - `message: str`
  - `debug_id: str`
- **Handler steps:**
  1. Generate short `debug_id` (uuid fragment)
  2. Resolve provider + credentials
  3. Build `CreatePostRequest(account_id=..., content=body.content)` — no `first_comment`
  4. Call `provider.create_post(user_id, request)`
  5. Return success response

**HTTP mapping:**

| Condition | Status |
|-----------|--------|
| Not connected / no credentials | 401 |
| Empty content, account mismatch, org target | 400 |
| Duplicate content (`LinkedInDuplicateContentError`) | 409 |
| Unipile 403 / insufficient permissions | 403 |
| Unipile 401 / disconnected account | 401 |
| Unipile 5xx / network | 502 |
| Unexpected server error | 500 |

User-facing messages must be safe; full diagnostics only in logs with `debug_id`.

### 4. Frontend — API (`linkedinSocial.ts`)

Add:

```typescript
publishLinkedInPost(payload: { content: string; account_id?: string })
```

- POST `/api/linkedin-social/posts/publish`
- Typed request/response interfaces
- Reuse `getLinkedInSocialErrorMessage()` for connection/auth errors

### 5. Frontend — `PublishLinkedInPanel.tsx`

Wire the existing button:

1. **On click:** call `publishLinkedInPost({ content: draft.trim(), account_id: selectedAccountId })`
   - Use the **`draft` prop** — same string as the preview pane and Save to Asset Library
   - Do **not** use `previewPayload.content` or `buildPublishPayload()` (those transform text for first-comment; not shown to user)
2. **Enable button when:** `connected && draft.trim()` (replace current `previewPayload.content` check)
3. **Disable while:** not connected, empty draft, or publish in-flight
4. **States:** loading spinner on button; success alert "Published to LinkedIn."; failure via error mapper
5. **First-comment UI (v1):** hide checkbox + link field **or** show disabled with helper text "Coming soon — v1 publishes full draft text only"
6. Remove tooltip "Publishing ships in Phase 2"
7. Force personal profile: if `selectedTarget === 'organization'`, disable publish with message to switch to profile

### 6. Logging & safety

- Log: `user_id`, `provider`, `account_id`, `content_length`, `debug_id`, Unipile status, `post_id` / `social_id`
- Never log: `UNIPILE_API_KEY`, full draft, auth headers
- Idempotency: rely on existing duplicate guard; no client-side double-submit (disable button while loading)

---

## Test Plan (aligned to v1 text-only)

### Unit — `UnipileClient`

- `create_post()` POSTs to `/api/v1/posts` with `{ account_id, text }` only
- 401/403/500 → `UnipileAPIError`

### Unit — `UnipileProvider.create_post()`

- Publishes valid text for stored personal account
- Rejects empty content
- Rejects account_id mismatch
- Rejects organization target
- Does **not** call any comment method

### API route

- Connected user + valid content → 200, `success=True`
- Not connected → 401
- Empty content → 400
- Duplicate → 409
- Unipile disconnected → 401/502 per mapping

### Frontend / manual QA

- Generate post → Connected badge → Publish → post appears on LinkedIn profile
- Button disabled when disconnected or empty draft
- Double-click does not create duplicate (button disabled + backend dedup)
- Published LinkedIn post text matches preview pane exactly (same `draft`; URLs stay in body)
- With "Move links to first comment" checked, preview still shows full draft; publish must not strip links in v1

### Update existing tests

- Refactor `test_linkedin_unipile_publish.py` and `test_linkedin_publish_route.py` to v1 scope (remove comment / partial-success cases until Phase 2)

---

## Assumptions & defaults

- `LINKEDIN_PROVIDER=unipile` for this path
- `UNIPILE_API_KEY` and `UNIPILE_DSN` configured on backend
- User already connected via Unipile hosted-auth; `unipile_account_id` stored in `linkedin_oauth_tokens`
- LinkedIn character limits enforced by Unipile/LinkedIn; optional ALwrity length check can be added later
- Zernio provider publish remains out of scope (Unipile-only for this feature)

---

## Future phases (not v1)

| Phase | Feature |
|-------|---------|
| 2 | First comment after post (`POST /api/v1/posts/{social_id}/comments`) + re-enable link-in-comment UI |
| 3 | Media attachments |
| 4 | Organization / company-page posting |
| 5 | Scheduling |

---

## Files to touch (implementation checklist)

| Action | File |
|--------|------|
| Add method | `backend/services/integrations/linkedin/unipile_client.py` |
| Implement | `backend/services/integrations/linkedin/unipile_provider.py` |
| Add route + models | `backend/api/linkedin_social_routes.py`, `backend/models/linkedin_social_models.py` |
| Add client | `frontend/src/api/linkedinSocial.ts` |
| Wire button | `frontend/src/components/LinkedInWriter/components/PublishLinkedInPanel.tsx` |
| Update tests | `backend/tests/test_linkedin_unipile_publish.py`, `backend/tests/api/test_linkedin_publish_route.py` |

**No changes needed for v1:** `firstCommentUtils.ts`, `publish_preflight.py` (reuse as-is), connection/oauth code.
