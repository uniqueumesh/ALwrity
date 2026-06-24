# ALwrity LinkedIn Account Connection Migration Plan
## Zernio to Unipile Hosted OAuth (Connection Only)

**Date:** 2026-06-18  
**Scope:** LinkedIn Personal Profile Connection Only  
**Excludes:** Analytics, Publishing, Comments, Organizations  
**Migration Complexity:** Low-Medium  
**Estimated Implementation Effort:** 1-2 sprints

---

## Executive Summary

This document outlines a focused migration plan to replace only the **LinkedIn account connection flow** from Zernio to Unipile Hosted OAuth. The goal is simple: when a user visits the ALwrity LinkedIn Writer landing page, they can connect their LinkedIn personal profile using Unipile's hosted authentication.

**What's In Scope:**
- OAuth connection flow (connect button → auth → callback → store account)
- Connection status checking
- Account disconnection
- Basic account info storage

**What's Out of Scope:**
- Analytics fetching
- Content publishing
- Organization pages
- Media uploads
- Comment management

---

## 1. Current vs Target Flow

### 1.1 Current Flow (Zernio)

```
User clicks "Connect LinkedIn"
         │
         ▼
Frontend: GET /api/linkedin-social/auth/url
         │
         ▼
Backend calls Zernio: GET /connect/linkedin
         │
         ▼
Zernio returns LinkedIn OAuth URL (headless)
         │
         ▼
Popup opens LinkedIn login
         │
         ▼
LinkedIn redirects to Zernio → Zernio redirects to our callback
         │
         ▼
Callback: GET /api/linkedin-social/callback?tempToken=...
         │
         ▼
Backend calls Zernio: POST /connect/linkedin/select-organization
         │
         ▼
Store: zernio_account_id, zernio_api_key, zernio_profile_id
         │
         ▼
Return: LINKEDIN_OAUTH_SUCCESS postMessage
```

### 1.2 Target Flow (Unipile Hosted Auth)

```
User clicks "Connect LinkedIn"
         │
         ▼
Frontend: GET /api/linkedin-social/auth/url
         │
         ▼
Backend calls Unipile: POST /api/v1/hosted/accounts/link
         │
         ▼
Unipile returns hosted auth URL (Unipile-hosted page)
         │
         ▼
Popup opens Unipile hosted auth page
         │
         ▼
Unipile handles LinkedIn OAuth (user sees Unipile UI)
         │
         ▼
Unipile redirects to our success/failure URL
         │
         ▼
Callback: GET /api/unipile/callback?account_id=...&status=success
         │
         ▼
Store: unipile_account_id, provider_mode='unipile'
         │
         ▼
Return: LINKEDIN_OAUTH_SUCCESS postMessage
```

**Key Difference:**
- Zernio: Returns direct LinkedIn OAuth URL (headless, ALwrity controls popup)
- Unipile: Returns Unipile-hosted auth page (user sees Unipile branding, simpler for ALwrity)

---

## 2. Affected Files (Connection Only)

### 2.1 Backend - Files to Modify

| File | Changes | Effort |
|------|---------|--------|
| `services/integrations/linkedin/factory.py` | Add 'unipile' to provider selection | Low |
| `services/integrations/linkedin_oauth.py` | Add Unipile auth URL generation, callback handler | Medium |
| `services/integrations/linkedin/types.py` | Add UnipileAccount type | Low |
| `.env` | Replace ZERNIO_API_KEY with UNIPILE_API_KEY, UNIPILE_DSN | Low |

### 2.2 Backend - Files to Create

| File | Purpose | Effort |
|------|---------|--------|
| `services/integrations/linkedin/unipile_client.py` | HTTP client for Unipile API (auth link only) | Low |
| `services/integrations/linkedin/unipile_provider.py` | Minimal provider implementing connection methods only | Low |
| `routers/linkedin_social.py` (if missing) | Dedicated router for social endpoints | Medium |

### 2.3 Backend - Files to Keep (Unchanged)

| File | Why Keep |
|------|----------|
| `protocol.py` | Provider contract unchanged |
| `account_resolution.py` | May need minor adaptation |
| `native_provider.py` | Stub for future, no changes |
| `zernio_client.py` | Keep during transition, delete later |
| `zernio_provider.py` | Keep during transition, delete later |

### 2.4 Frontend - Files to Modify

| File | Changes | Effort |
|------|---------|--------|
| `src/api/linkedinSocial.ts` | Handle any response format differences | Low |
| `src/utils/linkedInOAuthConnect.ts` | Update callback URL pattern matching | Low |

### 2.5 Frontend - Files Unchanged

| File | Why Unchanged |
|------|---------------|
| `LinkedInConnectionPlaceholder.tsx` | Uses hook, no direct changes |
| `LinkedInConnectedProfile.tsx` | Uses hook, no direct changes |
| `useLinkedInSocialConnection.ts` | Abstracts provider, same API contract |

---

## 3. API Changes

### 3.1 Existing Endpoints (Keep Same Contract)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/linkedin-social/auth/url` | GET | Get auth URL (now returns Unipile URL) |
| `/api/linkedin-social/callback` | GET | OAuth callback (or create `/api/unipile/callback`) |
| `/api/linkedin-social/connection/status` | GET | Check if connected |
| `/api/linkedin-social/disconnect` | POST | Disconnect account |

### 3.2 Request/Response Changes

**GET /api/linkedin-social/auth/url**

Response (same structure, different URL):
```json
{
  "authorization_url": "https://account.unipile.com/...",  // Changed from linkedin.com
  "state": "user_id:random_token",
  "provider": "unipile"  // Changed from "zernio"
}
```

**Callback Handling**

Current (Zernio):
```
GET /api/linkedin-social/callback?tempToken=xxx&accountId=xxx&connected=linkedin
```

New (Unipile):
```
GET /api/unipile/callback?account_id=xxx&status=success&name=internal_user_id
```

Or reuse existing route:
```
GET /api/linkedin-social/callback?account_id=xxx&status=success
```

---

## 4. Database Changes (Minimal)

### 4.1 Schema Addition

```sql
-- Add to linkedin_oauth_tokens table
ALTER TABLE linkedin_oauth_tokens ADD COLUMN unipile_account_id TEXT;
ALTER TABLE linkedin_oauth_tokens ADD COLUMN unipile_org_account_id TEXT;

-- provider_mode now accepts: 'zernio', 'native', 'unipile'
```

### 4.2 Data Storage

**Current (Zernio):**
```python
{
    "provider_mode": "zernio",
    "zernio_api_key": "encrypted_api_key",
    "zernio_account_id": "account_xxx",
    "zernio_profile_id": "profile_xxx"
}
```

**New (Unipile):**
```python
{
    "provider_mode": "unipile",
    "unipile_account_id": "account_xxx",  # From Unipile callback
    "account_name": "User Name"             # From Unipile account info
}
```

**Note:** Unipile stores tokens server-side; ALwrity only needs `account_id` reference.

---

## 5. Implementation Steps

### Phase 1: Foundation (Week 1)

**Tasks:**
1. **Add environment variables**
   ```bash
   UNIPILE_API_KEY=...
   UNIPILE_DSN=api1.unipile.com:13211
   LINKEDIN_PROVIDER=unipile
   ```

2. **Create Unipile HTTP client** (`unipile_client.py`)
   - Single method: `create_hosted_auth_link()`
   - POST to `/api/v1/hosted/accounts/link`
   - Payload:
     ```json
     {
       "type": "create",
       "providers": ["LINKEDIN"],
       "api_url": "https://{UNIPILE_DSN}",
       "expiresOn": "2026-06-18T15:00:00Z",
       "success_redirect_url": "{BACKEND_URL}/api/unipile/callback?status=success",
       "failure_redirect_url": "{BACKEND_URL}/api/unipile/callback?status=error",
       "notify_url": "{BACKEND_URL}/api/unipile/webhook",
       "name": "{internal_user_id}"
     }
     ```

3. **Update factory.py**
   - Add `elif mode == 'unipile': return _unipile_singleton()`

4. **Create minimal UnipileProvider** (`unipile_provider.py`)
   - Implement only `provider_name = "unipile"`
   - Implement `list_accounts()` - fetch from Unipile API
   - Skip: analytics, publishing, org methods (raise NotImplementedError or return empty)

**Deliverables:**
- Unipile client with auth link generation
- Provider skeleton
- Updated factory
- Working `/api/linkedin-social/auth/url` returning Unipile URL

---

### Phase 2: Callback & Storage (Week 1-2)

**Tasks:**
1. **Create callback endpoint** (`/api/unipile/callback`)
   - Handle `?account_id=xxx&status=success&name=user_id`
   - Handle `?status=error&message=...`
   - Store `unipile_account_id` in database
   - Return HTML with postMessage (reuse `oauth_callback_utils.py`)

2. **Update LinkedInOAuthService**
   - Add `store_unipile_credentials(user_id, account_id, account_name)`
   - Update `resolve_credentials()` to handle 'unipile' mode
   - Add `generate_unipile_auth_url(user_id)`

3. **Update connection status endpoint**
   - Return `provider: 'unipile'` when connected via Unipile
   - Fetch account info from Unipile API for display

4. **Update disconnect endpoint**
   - Call Unipile DELETE /api/v1/accounts/{account_id}
   - Mark local record inactive

**Deliverables:**
- Working OAuth callback
- Account storage
- Connection status showing Unipile accounts
- Disconnection working

---

### Phase 3: Integration & Testing (Week 2)

**Tasks:**
1. **Frontend verification**
   - Test connect button flow
   - Verify popup opens Unipile page
   - Verify callback redirects back
   - Verify connected state displays

2. **Error handling**
   - User cancels auth
   - Unipile service error
   - Network failures
   - Duplicate connection attempts

3. **Edge cases**
   - User already connected via Zernio (migration scenario)
   - User revokes access on LinkedIn side
   - Session expiration

**Deliverables:**
- End-to-end connection flow working
- Error cases handled gracefully
- Frontend displays correct connection state

---

### Phase 4: Cleanup (Post-Release)

**Tasks:**
1. Remove Zernio client and provider files
2. Remove Zernio-specific database columns (after migration period)
3. Update documentation

---

## 6. Minimal Code Structure

### 6.1 Unipile Client (Minimal)

```python
# services/integrations/linkedin/unipile_client.py
"""Minimal Unipile HTTP client for account connection."""

import os
import httpx
from typing import Optional
from datetime import datetime, timedelta
from loguru import logger

UNIPILE_BASE_URL = "https://{dsn}"

class UnipileClient:
    """HTTP client for Unipile account connection."""
    
    def __init__(self, api_key: Optional[str] = None, dsn: Optional[str] = None):
        self.api_key = api_key or os.getenv("UNIPILE_API_KEY")
        self.dsn = dsn or os.getenv("UNIPILE_DSN", "api1.unipile.com:13211")
        self.base_url = f"https://{self.dsn}"
        
    async def create_hosted_auth_link(
        self,
        user_id: str,
        success_url: str,
        failure_url: str,
        notify_url: str
    ) -> dict:
        """Generate Unipile hosted auth link for LinkedIn."""
        url = f"{self.base_url}/api/v1/hosted/accounts/link"
        
        expires_at = datetime.utcnow() + timedelta(hours=2)
        
        payload = {
            "type": "create",
            "providers": ["LINKEDIN"],
            "api_url": self.base_url,
            "expiresOn": expires_at.isoformat() + "Z",
            "success_redirect_url": success_url,
            "failure_redirect_url": failure_url,
            "notify_url": notify_url,
            "name": user_id  # Internal user ID for matching
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json=payload,
                headers={
                    "X-API-KEY": self.api_key,
                    "Content-Type": "application/json"
                },
                timeout=30.0
            )
            response.raise_for_status()
            data = response.json()
            
        return {
            "auth_url": data["link"],  # Unipile returns this field
            "expires_at": expires_at.isoformat()
        }
    
    async def get_account(self, account_id: str) -> dict:
        """Fetch account details from Unipile."""
        url = f"{self.base_url}/api/v1/accounts/{account_id}"
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                headers={"X-API-KEY": self.api_key},
                timeout=30.0
            )
            response.raise_for_status()
            return response.json()
    
    async def list_accounts(self) -> list:
        """List all connected accounts."""
        url = f"{self.base_url}/api/v1/accounts"
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                headers={"X-API-KEY": self.api_key},
                timeout=30.0
            )
            response.raise_for_status()
            data = response.json()
            return data.get("items", [])
    
    async def delete_account(self, account_id: str) -> bool:
        """Disconnect account from Unipile."""
        url = f"{self.base_url}/api/v1/accounts/{account_id}"
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.delete(
                    url,
                    headers={"X-API-KEY": self.api_key},
                    timeout=30.0
                )
                return response.status_code < 400
        except Exception as e:
            logger.warning(f"Failed to delete Unipile account {account_id}: {e}")
            return False
```

### 6.2 Unipile Provider (Minimal)

```python
# services/integrations/linkedin/unipile_provider.py
"""Minimal Unipile provider for LinkedIn connection only."""

from typing import Any, Optional, List
from loguru import logger

from services.integrations.linkedin.protocol import LinkedInSocialProvider
from services.integrations.linkedin.types import LinkedInAccount, LinkedInOrganization
from services.integrations.linkedin.unipile_client import UnipileClient

class UnipileProvider:
    """Minimal LinkedIn provider via Unipile (connection only)."""
    
    provider_name = "unipile"
    
    def __init__(self, api_key: Optional[str] = None, dsn: Optional[str] = None):
        self._client = UnipileClient(api_key, dsn)
    
    async def list_accounts(self, user_id: str) -> List[LinkedInAccount]:
        """List connected LinkedIn accounts."""
        try:
            items = await self._client.list_accounts()
            accounts = []
            
            for item in items:
                # Filter for LinkedIn accounts only
                if item.get("provider") != "LINKEDIN":
                    continue
                    
                accounts.append(LinkedInAccount(
                    account_id=item["id"],
                    account_type="personal",  # Default, refine if needed
                    username=item.get("name", "Unknown"),
                    platform="linkedin"
                ))
            
            return accounts
            
        except Exception as e:
            logger.error(f"Failed to list Unipile accounts: {e}")
            return []
    
    async def list_organizations(self, user_id: str, account_id: str) -> List[LinkedInOrganization]:
        """Not implemented for connection-only mode."""
        return []
    
    async def get_profile_aggregate_analytics(self, **kwargs) -> dict:
        """Not implemented for connection-only mode."""
        raise NotImplementedError("Analytics not supported in connection-only mode")
    
    async def get_org_aggregate_analytics(self, **kwargs) -> dict:
        """Not implemented for connection-only mode."""
        raise NotImplementedError("Analytics not supported in connection-only mode")
    
    async def get_post_analytics(self, **kwargs) -> dict:
        """Not implemented for connection-only mode."""
        raise NotImplementedError("Analytics not supported in connection-only mode")
    
    async def create_post(self, **kwargs):
        """Not implemented for connection-only mode."""
        raise NotImplementedError("Publishing not supported in connection-only mode")
    
    async def upload_media(self, **kwargs):
        """Not implemented for connection-only mode."""
        raise NotImplementedError("Publishing not supported in connection-only mode")
    
    async def schedule_post(self, **kwargs):
        """Not implemented for connection-only mode."""
        raise NotImplementedError("Publishing not supported in connection-only mode")
    
    async def list_comments(self, **kwargs) -> list:
        """Not implemented for connection-only mode."""
        raise NotImplementedError("Comments not supported in connection-only mode")
    
    async def reply_to_comment(self, **kwargs):
        """Not implemented for connection-only mode."""
        raise NotImplementedError("Comments not supported in connection-only mode")
    
    async def resolve_account_avatar_url(self, user_id: str, account: LinkedInAccount) -> Optional[str]:
        """Fetch avatar URL from Unipile account data."""
        try:
            data = await self._client.get_account(account.account_id)
            # Extract avatar from Unipile response (field name may vary)
            return data.get("profile_picture") or data.get("avatar_url")
        except Exception as e:
            logger.warning(f"Failed to fetch avatar for {account.account_id}: {e}")
            return None
```

### 6.3 OAuth Service Updates (Key Methods)

```python
# In services/integrations/linkedin_oauth.py

# Add to imports
from services.integrations.linkedin.unipile_client import UnipileClient

# Add to LinkedInOAuthService class:

def generate_unipile_auth_url(self, user_id: str) -> dict:
    """Generate Unipile hosted auth URL for LinkedIn connection."""
    import os
    
    client = UnipileClient()
    
    backend_url = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
    
    success_url = f"{backend_url}/api/unipile/callback?status=success"
    failure_url = f"{backend_url}/api/unipile/callback?status=error"
    notify_url = f"{backend_url}/api/unipile/webhook"
    
    result = client.create_hosted_auth_link(
        user_id=user_id,
        success_url=success_url,
        failure_url=failure_url,
        notify_url=notify_url
    )
    
    return {
        "auth_url": result["auth_url"],
        "state": user_id,  # Unipile returns 'name' param, we use it as state
        "provider": "unipile"
    }

def handle_unipile_callback(
    self,
    user_id: str,
    account_id: str,
    status: str,
    error_message: Optional[str] = None
) -> bool:
    """Handle Unipile OAuth callback."""
    if status != "success":
        logger.error(f"Unipile callback failed for user {user_id}: {error_message}")
        return False
    
    # Fetch account details from Unipile
    client = UnipileClient()
    try:
        account_data = client.get_account(account_id)
        account_name = account_data.get("name", "Unknown")
    except Exception as e:
        logger.warning(f"Could not fetch account details: {e}")
        account_name = None
    
    # Store in database
    return self.store_unipile_credentials(
        user_id=user_id,
        unipile_account_id=account_id,
        account_name=account_name
    )

def store_unipile_credentials(
    self,
    user_id: str,
    unipile_account_id: str,
    account_name: Optional[str] = None
) -> bool:
    """Store Unipile account credentials."""
    try:
        self._init_db(user_id)
        db_path = self._get_db_path(user_id)
        
        with sqlite3.connect(db_path) as conn:
            cursor = conn.cursor()
            
            # Deactivate existing tokens
            cursor.execute(
                "UPDATE linkedin_oauth_tokens SET is_active = 0 WHERE user_id = ?",
                (user_id,)
            )
            
            # Insert new Unipile credentials
            cursor.execute(
                """
                INSERT INTO linkedin_oauth_tokens (
                    user_id, provider_mode, unipile_account_id, account_name, is_active
                ) VALUES (?, 'unipile', ?, ?, 1)
                """,
                (user_id, unipile_account_id, account_name)
            )
            
            conn.commit()
            
        logger.info(f"Stored Unipile credentials for user {user_id}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to store Unipile credentials: {e}")
        return False
```

### 6.4 Router Endpoint (Minimal)

```python
# In routers/linkedin_social.py (new file) or existing router

from fastapi import APIRouter, Request, Query, HTTPException
from fastapi.responses import HTMLResponse
from typing import Optional

from services.integrations.linkedin_oauth import LinkedInOAuthService
from services.integrations.oauth_callback_utils import build_oauth_callback_html

router = APIRouter(prefix="/api/linkedin-social", tags=["LinkedIn Social"])
oauth_service = LinkedInOAuthService()

@router.get("/auth/url")
async def get_auth_url(
    user_id: str = Query(..., description="User ID"),
    state: Optional[str] = None
):
    """Get OAuth authorization URL (Unipile hosted auth)."""
    provider = oauth_service.get_provider_mode()  # 'unipile' from env
    
    if provider == "unipile":
        result = oauth_service.generate_unipile_auth_url(user_id)
        return {
            "authorization_url": result["auth_url"],
            "state": result["state"],
            "provider": "unipile"
        }
    else:
        # Fallback to existing Zernio or native
        ...

# New callback endpoint for Unipile
@router.get("/unipile/callback")
async def unipile_callback(
    request: Request,
    status: str = Query(..., description="success or error"),
    account_id: Optional[str] = Query(None, description="Unipile account ID"),
    name: Optional[str] = Query(None, description="Internal user ID passed as 'name'"),
    message: Optional[str] = Query(None, description="Error message if failed")
):
    """Handle Unipile OAuth callback."""
    
    user_id = name  # We passed user_id as 'name' param
    
    if status == "success" and account_id and user_id:
        success = oauth_service.handle_unipile_callback(
            user_id=user_id,
            account_id=account_id,
            status=status
        )
        
        if success:
            html = build_oauth_callback_html(
                payload={"type": "LINKEDIN_OAUTH_SUCCESS", "success": True},
                title="LinkedIn Connected",
                heading="Connection Successful",
                message="Your LinkedIn account has been connected successfully."
            )
            return HTMLResponse(content=html)
    
    # Error case
    html = build_oauth_callback_html(
        payload={
            "type": "LINKEDIN_OAUTH_ERROR",
            "success": False,
            "error": message or "Connection failed"
        },
        title="Connection Failed",
        heading="Connection Failed",
        message=message or "Failed to connect LinkedIn account. Please try again."
    )
    return HTMLResponse(content=html)
```

---

## 7. Environment Variables

### 7.1 Required

```bash
# Unipile Configuration
UNIPILE_API_KEY=your_unipile_api_key_here
UNIPILE_DSN=api1.unipile.com:13211  # Or your assigned DSN

# Provider Selection
LINKEDIN_PROVIDER=unipile

# Callback URLs
BACKEND_URL=https://your-backend.ngrok-free.dev
FRONTEND_URL=https://your-frontend.ngrok-free.dev
```

### 7.2 Optional

```bash
# For backward compatibility during migration
# ZERNIO_API_KEY=...  # Remove after migration
```

---

## 8. Testing Checklist

### 8.1 Connection Flow

| Step | Expected Result | Status |
|------|-----------------|--------|
| Click "Connect LinkedIn" | Popup opens Unipile hosted auth page | ⬜ |
| Complete LinkedIn auth on Unipile | Redirected to success callback | ⬜ |
| Success callback | Database stores unipile_account_id | ⬜ |
| Success callback | Frontend receives LINKEDIN_OAUTH_SUCCESS | ⬜ |
| Frontend updates | Shows connected state | ⬜ |
| Refresh page | Still shows connected | ⬜ |

### 8.2 Disconnection

| Step | Expected Result | Status |
|------|-----------------|--------|
| Click "Disconnect" | Confirmation dialog | ⬜ |
| Confirm | API calls Unipile to delete account | ⬜ |
| Confirm | Database marks inactive | ⬜ |
| Confirm | UI returns to "Connect" button | ⬜ |

### 8.3 Error Cases

| Scenario | Expected Behavior | Status |
|----------|-------------------|--------|
| User closes popup | Frontend shows "cancelled" message | ⬜ |
| User denies LinkedIn permissions | Callback with error, shows message | ⬜ |
| Unipile service down | Frontend timeout, retry option | ⬜ |
| Duplicate connection attempt | Updates existing record | ⬜ |

---

## 9. Risks & Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Unipile hosted page UX different | User confusion | Medium | Document the flow, set user expectations |
| Unipile API changes | Breaks connection | Low | Pin API version, monitor changelogs |
| Callback URL mismatch | OAuth fails | Medium | Verify URL configs in all environments |
| User ID not returned correctly | Can't match account | Low | Use 'name' param, verify in callback |
| Existing Zernio users confused | Support tickets | Medium | Clear messaging about provider change |

---

## 10. Success Criteria

- [ ] User can click "Connect LinkedIn" and complete OAuth flow
- [ ] Connection status persists across page refreshes
- [ ] User can disconnect and reconnect
- [ ] No Zernio API calls are made when `LINKEDIN_PROVIDER=unipile`
- [ ] Frontend requires no changes (or minimal changes)
- [ ] Existing connection status endpoint works with Unipile data
- [ ] Error cases handled gracefully with user-friendly messages

---

## 11. Migration Timeline

| Week | Tasks | Deliverable |
|------|-------|-------------|
| Week 1 | Unipile client, provider skeleton, auth URL endpoint | Auth URL returns Unipile link |
| Week 2 | Callback endpoint, account storage, status checking | End-to-end connection works |
| Week 3 | Testing, error handling, edge cases | Production-ready connection flow |
| Week 4 | (Optional) Remove Zernio code | Clean codebase |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-06-18 | Architecture Review | Initial focused plan |

---

**End of Document**
