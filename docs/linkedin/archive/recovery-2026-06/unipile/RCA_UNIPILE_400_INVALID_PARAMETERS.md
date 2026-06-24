# Root Cause Analysis: Unipile HTTP 400 Invalid Parameters Error

## Document Information

**Date:** 2026-06-18  
**Status:** Analysis Complete  
**Priority:** High  
**Severity:** Blocking OAuth Flow  

---

## Executive Summary

After fixing the async/await architecture issue (Phase 1-3), a new error has emerged when attempting to generate a Unipile hosted auth link. The Unipile API returns HTTP 400 with the error:

```
{"status":400,"type":"errors/invalid_parameters","title":"Invalid parameters","detail":"One or more request parameters are invalid or missing..."}
```

**Root Cause:** The `expiresOn` timestamp format sent to Unipile does not match their strict ISO 8601 validation pattern. Python's `datetime.isoformat()` produces 6 decimal places (microseconds), but Unipile's API regex pattern requires exactly 3 decimal places (milliseconds).

---

## Error Analysis

### Error Message (From User Report)

```
Failed to generate Unipile auth URL: Unipile API returned HTTP 400: 
{
  "status": 400,
  "type": "errors/invalid_parameters",
  "title": "Invalid parameters",
  "detail": "One or more request parameters are invalid or missing.",
  "value": {
    "type": "create",
    "providers": ["LINKEDIN"],
    "api_url": "https://api30.unipile.com:16037",
    "expiresOn": "2026-06-18T13:33:18.457643Z",
    "success_redirect_url": "...",
    "failure_redirect_url": "...",
    "notify_url": "...",
    "name": "user_33md5AyX4Z8Zy9v51VJVgnXqAnM"
  },
  "message": "Expected union value"
}
```

### Critical Observation

The `expiresOn` value sent was:
```
"2026-06-18T13:33:18.457643Z"
```

Notice: **6 decimal places** (`.457643`) after the seconds.

---

## Root Cause Identification

### The Mismatch

**What Python Produces:**
```python
datetime.utcnow().isoformat() + "Z"
# Produces: "2026-06-18T13:33:18.457643Z"  (6 decimal places)
```

**What Unipile Requires:**
According to Unipile's JSON Schema validation (from the error detail):
```json
{
  "expiresOn": {
    "pattern": "^[1-2]\\d{3}-[0-1]\\d-[0-3]\\dT\\d{2}:\\d{2}:\\d{2}.\\d{3}Z$",
    "example": "2025-12-31T23:59:59.999Z"
  }
}
```

The regex pattern `\\d{3}` requires **exactly 3 decimal places**, not 6.

### Where the Bug Exists

**File:** `backend/services/integrations/linkedin/unipile_client.py`

**Line 133 (create_hosted_auth_link method):**
```python
"expiresOn": expires_at.isoformat() + "Z",
```

**Line 292 (reconnect_account method):**
```python
"expiresOn": expires_at.isoformat() + "Z",
```

Both methods have the same issue.

---

## Technical Details

### Python datetime.isoformat() Behavior

Python's `datetime.isoformat()` method:
- When the datetime has microseconds (default), it outputs 6 decimal places
- Format: `YYYY-MM-DDTHH:MM:SS.ssssss` (6 digits after decimal)
- Example: `2026-06-18T13:33:18.457643`

### Unipile API Requirements

Unipile's JSON Schema validation enforces:
- Format: `YYYY-MM-DDTHH:MM:SS.sssZ` (exactly 3 digits after decimal)
- Pattern: `^[1-2]\d{3}-[0-1]\d-[0-3]\dT\d{2}:\d{2}:\d{2}.\d{3}Z$`
- The `\.\d{3}` part requires exactly 3 decimal places

### Why This Causes HTTP 400

1. Request payload is sent to Unipile API
2. Unipile validates the JSON against its schema
3. The `expiresOn` field fails regex validation (6 digits ≠ 3 digits)
4. Unipile returns HTTP 400 with detailed validation error
5. Error propagates up as `UnipileAPIError`
6. Frontend shows "Failed to generate Unipile auth URL"

---

## Call Chain Analysis

1. **Frontend:** User clicks "Connect LinkedIn"
2. **Frontend API Call:** `GET /api/linkedin-social/auth/url`
3. **Router:** `get_authorization_url()` in `linkedin_social_routes.py`
4. **Service:** `generate_authorization_url()` in `linkedin_oauth.py`
5. **Provider Detection:** Detects `LINKEDIN_PROVIDER=unipile`
6. **Client Call:** `await client.create_hosted_auth_link(...)`
7. **UnipileClient:** `create_hosted_auth_link()` method
8. **Payload Construction:** Line 129-138 builds JSON payload with invalid `expiresOn`
9. **HTTP Request:** POST to `/api/v1/hosted/accounts/link`
10. **Unipile Validation:** Schema validation fails on `expiresOn`
11. **Error Response:** HTTP 400 returned
12. **Exception Raised:** `UnipileAPIError` with validation details
13. **Error Propagation:** Error bubbles up to frontend

---

## Scope of the Fix

### Files to Modify

| File | Lines | Change |
|------|-------|--------|
| `backend/services/integrations/linkedin/unipile_client.py` | 133 | Format `expiresOn` to 3 decimal places |
| `backend/services/integrations/linkedin/unipile_client.py` | 292 | Format `expiresOn` to 3 decimal places |

### Affected Methods

1. `create_hosted_auth_link()` - Line 126, 133
2. `reconnect_account()` - Line 285, 292

### No Breaking Changes

- This is a format change only
- The underlying data (timestamp) remains the same
- Only the string representation changes (truncating microseconds to milliseconds)

---

## Recommended Implementation Strategy

### Option A: Truncate Microseconds to Milliseconds (Recommended)

**Approach:** Use string formatting to ensure exactly 3 decimal places.

**Code Change:**
```python
# Current (line 133):
"expiresOn": expires_at.isoformat() + "Z",

# Fixed:
"expiresOn": expires_at.strftime("%Y-%m-%dT%H:%M:%S.") + f"{expires_at.microsecond // 1000:03d}Z",
```

Or more Pythonic:
```python
# Truncate microseconds to milliseconds
expires_ms = expires_at.microsecond // 1000
"expiresOn": expires_at.strftime("%Y-%m-%dT%H:%M:%S") + f".{expires_ms:03d}Z",
```

### Option B: Use strftime with Milliseconds

**Approach:** Use `strftime` with proper format string.

**Code Change:**
```python
# Format with exactly 3 decimal places for milliseconds
"expiresOn": expires_at.strftime("%Y-%m-%dT%H:%M:%S.") + f"{expires_at.microsecond // 1000:03d}Z",
```

### Option C: Round to Milliseconds

**Approach:** Round microseconds to nearest millisecond instead of truncating.

**Code Change:**
```python
# Round to nearest millisecond
expires_ms = round(expires_at.microsecond / 1000)
if expires_ms == 1000:  # Handle overflow
    expires_at = expires_at.replace(second=expires_at.second + 1, microsecond=0)
    expires_ms = 0
"expiresOn": expires_at.strftime("%Y-%m-%dT%H:%M:%S") + f".{expires_ms:03d}Z",
```

**Recommendation:** Option A or B (truncation is simpler and sufficient; the extra precision is not critical for a 2-hour expiration window).

---

## Testing Verification

### Test Case 1: Verify Timestamp Format

**Steps:**
1. Call `create_hosted_auth_link()` with any user_id
2. Inspect the payload sent to Unipile (add debug logging if needed)
3. Verify `expiresOn` has exactly 3 decimal places

**Expected:**
```
"expiresOn": "2026-06-18T13:33:18.457Z"  (3 decimal places)
```

### Test Case 2: Full OAuth Flow

**Steps:**
1. Set `LINKEDIN_PROVIDER=unipile`
2. Click "Connect LinkedIn" in UI
3. Verify no HTTP 400 error
4. Verify user is redirected to Unipile hosted auth page

### Test Case 3: Reconnection Flow

**Steps:**
1. Disconnect existing Unipile account
2. Attempt to reconnect
3. Verify no HTTP 400 error

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Other timestamp formats also invalid | Low | Medium | Test with actual Unipile API call |
| Timezone handling issues | Low | Low | Use UTC consistently (already doing this) |
| Other fields fail validation | Low | Medium | Review full error message for other issues |

---

## Related Documentation

- Unipile Hosted Auth API: https://developer.unipile.com/docs/hosted-auth
- Python datetime.strftime format codes: https://docs.python.org/3/library/datetime.html#strftime-and-strptime-format-codes
- ISO 8601 standard: https://en.wikipedia.org/wiki/ISO_8601

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-06-18 | RCA Team | Initial root cause analysis |

---

## Summary

The HTTP 400 "Invalid parameters" error is caused by a timestamp format mismatch. Python's `datetime.isoformat()` produces 6 decimal places (microseconds), but Unipile's API regex validation requires exactly 3 decimal places (milliseconds). The fix involves formatting the `expiresOn` timestamp to truncate or format microseconds to exactly 3 digits.

**Fix Complexity:** Low (single line change in 2 places)  
**Estimated Fix Time:** 15 minutes  
**Testing Time:** 30 minutes  

---

**End of Root Cause Analysis**
