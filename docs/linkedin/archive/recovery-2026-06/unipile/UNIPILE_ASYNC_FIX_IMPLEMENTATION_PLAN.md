# Unipile LinkedIn OAuth Async Fix Implementation Plan

## Document Information

**Date:** 2026-06-18  
**Status:** Implementation Plan (Pending Review)  
**Priority:** High  
**Risk Level:** Medium  
**Estimated Effort:** 2-4 hours  

---

## Executive Summary

This document outlines the implementation plan to fix the `asyncio.run()` error when using Unipile as the LinkedIn OAuth provider. The fix converts synchronous methods in `LinkedInOAuthService` to asynchronous, aligning with FastAPI's async architecture.

**Root Cause Recap:**
- FastAPI routes run in an async event loop
- `LinkedInOAuthService.generate_authorization_url()` is synchronous
- It calls `asyncio.run()` to execute async Unipile client methods
- Python forbids nested event loops → `RuntimeError`

**Solution:** Convert service methods to `async def` and add `await` at all call sites.

---

## Goals

### Primary Goals
1. Fix the `asyncio.run()` error for Unipile OAuth flow
2. Maintain backward compatibility with Zernio provider
3. Ensure native OAuth provider continues to work
4. Follow FastAPI async/await best practices

### Secondary Goals
5. Improve error logging specificity (fix misleading "missing API key" message)
6. Maintain code consistency across the LinkedIn integration
7. Add proper exception handling for async operations

---

## Implementation Strategy

### Approach: Option A - Convert Service to Async

**Rationale:**
- FastAPI is inherently async - best practice is to use `async/await` throughout
- Aligns with existing async patterns in the codebase (e.g., `landing_analytics.py` uses `asyncio.create_task()`)
- Minimal architectural changes - same logic, different execution model
- Most maintainable long-term solution

---

## Detailed Implementation Steps

### Phase 1: Update LinkedInOAuthService Core Methods

**File:** `backend/services/integrations/linkedin_oauth.py`

#### Step 1.1: Convert `generate_authorization_url()` to Async

**Current State:**
```python
def generate_authorization_url(self, user_id: str, state: Optional[str] = None) -> Dict[str, str]:
    # ... sync code with asyncio.run() inside
```

**Target State:**
```python
async def generate_authorization_url(self, user_id: str, state: Optional[str] = None) -> Dict[str, str]:
    # ... async code with direct await for Unipile calls
```

**Changes Required:**
1. Change function signature from `def` to `async def`
2. Remove `asyncio.run()` wrapper around Unipile client call
3. Replace with direct `await` for `client.create_hosted_auth_link()`
4. Keep Zernio and native paths unchanged (they're already sync)
5. Update docstring to indicate async nature

**Lines Affected:** 1014-1091 (approximately)

**Specific Code Changes:**
- Line 1066-1080: Remove `import asyncio` and `asyncio.run()` block
- Line 1069-1077: Replace with direct `await client.create_hosted_auth_link(...)`
- The Zernio path (lines 1021-1050) stays synchronous - no changes needed
- The Native path (lines 1089-1124) stays synchronous - no changes needed

#### Step 1.2: Convert `disconnect_user()` to Async

**Current State:**
```python
def disconnect_user(self, user_id: str) -> Dict[str, Any]:
    # ... sync code with asyncio.run() for Unipile deletion
```

**Target State:**
```python
async def disconnect_user(self, user_id: str) -> Dict[str, Any]:
    # ... async code with direct await
```

**Changes Required:**
1. Change function signature from `def` to `async def`
2. Remove `asyncio.run()` wrapper around `client.delete_account()`
3. Replace with direct `await client.delete_account(...)`

**Lines Affected:** 773-822 (approximately)

**Specific Code Changes:**
- Lines 788-792: Remove `import asyncio` inside function
- Lines 790-792: Replace `asyncio.run(client.delete_account(...))` with `await client.delete_account(...)`

#### Step 1.3: Convert `handle_unipile_callback()` to Async

**Current State:**
```python
def handle_unipile_callback(self, user_id: str, account_id: str, ...) -> bool:
    # ... sync code with asyncio.run() for fetching account details
```

**Target State:**
```python
async def handle_unipile_callback(self, user_id: str, account_id: str, ...) -> bool:
    # ... async code with direct await
```

**Changes Required:**
1. Change function signature from `def` to `async def`
2. Remove `asyncio.run()` wrapper around `client.get_account()`
3. Replace with direct `await client.get_account(...)`

**Lines Affected:** 1436-1509 (approximately)

**Specific Code Changes:**
- Lines 1476-1479: Remove `import asyncio` and `asyncio.run()` block
- Line 1479: Replace with `account_data = await client.get_account(account_id)`

---

### Phase 2: Update Router Call Sites

**File:** `backend/api/linkedin_social_routes.py`

#### Step 2.1: Update `get_authorization_url()` Route

**Current Code:**
```python
@router.get("/auth/url")
async def get_authorization_url(...) -> Dict[str, str]:
    ...
    payload = _oauth_service.generate_authorization_url(user_id, oauth_state)
    ...
```

**Required Change:**
```python
@router.get("/auth/url")
async def get_authorization_url(...) -> Dict[str, str]:
    ...
    payload = await _oauth_service.generate_authorization_url(user_id, oauth_state)
    ...
```

**Lines Affected:** 140

#### Step 2.2: Update `disconnect_linkedin()` Route

**Current Code:**
```python
@router.post("/disconnect")
async def disconnect_linkedin(...) -> Dict[str, Any]:
    ...
    result = _oauth_service.disconnect_user(user_id)
    ...
```

**Required Change:**
```python
@router.post("/disconnect")
async def disconnect_linkedin(...) -> Dict[str, Any]:
    ...
    result = await _oauth_service.disconnect_user(user_id)
    ...
```

**Lines Affected:** 301

#### Step 2.3: Update `handle_oauth_callback_get()` Route (Unipile Path)

**Current Code:**
```python
ok = _oauth_service.handle_unipile_callback(user_id=user_id, ...)
```

**Required Change:**
```python
ok = await _oauth_service.handle_unipile_callback(user_id=user_id, ...)
```

**Lines Affected:** Around line 210 (inside the Unipile callback handling block)

---

### Phase 3: Fix Error Logging Specificity

**File:** `backend/api/linkedin_social_routes.py`

#### Step 3.1: Improve Error String Matching

**Current Code (lines 149-155):**
```python
except ValueError as e:
    error_str = str(e).lower()
    if "zernio" in error_str:
        logger.error(f"[LinkedInConnect] missing ZERNIO_API_KEY user_id={user_id}")
    elif "unipile" in error_str:
        logger.error(f"[LinkedInConnect] missing UNIPILE_API_KEY user_id={user_id}")
```

**Problem:** Any error containing the word "unipile" triggers the "missing API key" log message, even if the API key is configured.

**Target Code:**
```python
except ValueError as e:
    error_str = str(e).lower()
    if "zernio_api_key is not configured" in error_str:
        logger.error(f"[LinkedInConnect] missing ZERNIO_API_KEY user_id={user_id}")
    elif "unipile_api_key is not configured" in error_str:
        logger.error(f"[LinkedInConnect] missing UNIPILE_API_KEY user_id={user_id}")
    else:
        logger.warning(f"[LinkedInConnect] configuration error user_id={user_id}: {e}")
```

**Benefit:** More accurate logging that distinguishes between missing API keys and other configuration/runtime errors.

---

### Phase 4: Verify No Regressions

#### Step 4.1: Zernio Provider Verification

**Check:** Ensure Zernio path in `generate_authorization_url()` still works

**Verification Method:**
1. Set `LINKEDIN_PROVIDER=zernio`
2. Call `GET /api/linkedin-social/auth/url`
3. Verify it returns Zernio auth URL without errors

**Expected Behavior:** Should work unchanged - Zernio path doesn't use `await`

#### Step 4.2: Native Provider Verification

**Check:** Ensure native OAuth path still works

**Verification Method:**
1. Set `LINKEDIN_PROVIDER=native`
2. Call `GET /api/linkedin-social/auth/url`
3. Verify it returns native LinkedIn OAuth URL

**Expected Behavior:** Should work unchanged - Native path doesn't use `await`

#### Step 4.3: Other Service Methods Verification

**Check:** Ensure other methods in `LinkedInOAuthService` are not affected

**Methods to Verify:**
- `store_zernio_credentials()` - stays sync
- `store_native_tokens()` - stays sync
- `store_unipile_credentials()` - stays sync
- `get_connection_status()` - stays sync
- `resolve_credentials()` - stays sync
- `revoke_token()` - stays sync
- All private helper methods (_init_db, _get_db_path, etc.) - stay sync

**Rationale:** Only methods that call async Unipile client need to be async. Database operations (SQLite) are blocking I/O but don't interact with the event loop in the same way.

---

## Files to Modify

| File | Lines | Changes |
|------|-------|---------|
| `backend/services/integrations/linkedin_oauth.py` | ~1014 | Add `async` to `generate_authorization_url()`, remove `asyncio.run()` |
| `backend/services/integrations/linkedin_oauth.py` | ~773 | Add `async` to `disconnect_user()`, remove `asyncio.run()` |
| `backend/services/integrations/linkedin_oauth.py` | ~1436 | Add `async` to `handle_unipile_callback()`, remove `asyncio.run()` |
| `backend/api/linkedin_social_routes.py` | ~140 | Add `await` to `_oauth_service.generate_authorization_url()` call |
| `backend/api/linkedin_social_routes.py` | ~301 | Add `await` to `_oauth_service.disconnect_user()` call |
| `backend/api/linkedin_social_routes.py` | ~210 | Add `await` to `_oauth_service.handle_unipile_callback()` call |
| `backend/api/linkedin_social_routes.py` | ~149-155 | Improve error string matching specificity |

---

## Testing Plan

### Test Case 1: Unipile Auth URL Generation

**Steps:**
1. Set `LINKEDIN_PROVIDER=unipile` and valid `UNIPILE_API_KEY`
2. Authenticate as a test user
3. Call `GET /api/linkedin-social/auth/url`

**Expected Result:**
- HTTP 200 OK
- Response contains `authorization_url` starting with `https://account.unipile.com/`
- Response contains `provider: "unipile"`
- No errors in logs

### Test Case 2: Unipile Callback Handling

**Steps:**
1. Complete OAuth flow through Unipile hosted page
2. Verify callback hits `GET /api/linkedin-social/callback?provider=unipile&status=success&account_id=xxx`

**Expected Result:**
- HTML response with `LINKEDIN_OAUTH_SUCCESS` postMessage
- Account stored in database with `provider_mode='unipile'`
- No `asyncio` related errors

### Test Case 3: Unipile Disconnection

**Steps:**
1. Connect LinkedIn via Unipile
2. Call `POST /api/linkedin-social/disconnect`

**Expected Result:**
- HTTP 200 OK
- Account marked inactive in database
- Unipile API called to delete remote account
- No errors

### Test Case 4: Zernio Regression Test

**Steps:**
1. Set `LINKEDIN_PROVIDER=zernio`
2. Call `GET /api/linkedin-social/auth/url`

**Expected Result:**
- Works exactly as before (no changes to Zernio code path)

### Test Case 5: Native OAuth Regression Test

**Steps:**
1. Set `LINKEDIN_PROVIDER=native`
2. Call `GET /api/linkedin-social/auth/url`

**Expected Result:**
- Works exactly as before (no changes to native OAuth code path)

---

## Rollback Plan

If issues are discovered:

1. **Immediate Rollback:**
   ```bash
   git checkout HEAD -- backend/services/integrations/linkedin_oauth.py
   git checkout HEAD -- backend/api/linkedin_social_routes.py
   ```

2. **Switch Provider (Temporary):**
   ```bash
   # In .env
   LINKEDIN_PROVIDER=zernio
   ```

3. **Restart Backend**

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Zernio path broken | Low | High | Test before deploy; easy rollback |
| Native OAuth broken | Low | High | Test before deploy; easy rollback |
| Other async issues | Low | Medium | Proper exception handling; logging |
| Database locks with async SQLite | Low | Medium | SQLite operations remain sync; no change to DB code |

---

## Success Criteria

- [ ] All 5 test cases pass
- [ ] No `asyncio.run()` errors in logs
- [ ] No "coroutine was never awaited" warnings
- [ ] Error messages are accurate (not misleading "missing API key")
- [ ] Code follows ALwrity async patterns
- [ ] No linter errors
- [ ] No breaking changes to existing Zernio users

---

## Timeline

| Phase | Estimated Time | Cumulative |
|-------|---------------|------------|
| Phase 1: OAuthService changes | 45 min | 45 min |
| Phase 2: Router changes | 30 min | 1 hr 15 min |
| Phase 3: Error logging fix | 15 min | 1 hr 30 min |
| Phase 4: Testing | 1 hr | 2 hr 30 min |
| Buffer | 30 min | 3 hr |

---

## Post-Implementation Review Checklist

- [ ] Verify all async methods have `async def` in signature
- [ ] Verify all async calls have `await` prefix
- [ ] Verify no `asyncio.run()` calls remain in modified methods
- [ ] Check log messages for clarity and accuracy
- [ ] Run full LinkedIn OAuth flow end-to-end
- [ ] Document any deviations from this plan

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-06-18 | Architecture Review | Initial implementation plan |

---

**End of Implementation Plan**
