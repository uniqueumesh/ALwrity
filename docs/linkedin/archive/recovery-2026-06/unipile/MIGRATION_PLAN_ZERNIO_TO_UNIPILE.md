# ALwrity Architecture Migration Plan
## Zernio to Unipile Hosted OAuth

**Date:** 2026-06-18  
**Status:** Architecture Document Only - No Code Changes  
**Migration Complexity:** High  
**Estimated Implementation Effort:** 3-4 sprints

---

## Executive Summary

This document outlines the complete architecture migration plan to replace the Zernio LinkedIn integration with Unipile Hosted OAuth. The migration follows ALwrity's existing architecture principles while introducing Unipile's hosted authentication flow.

**Key Principles:**
- Follow existing modular architecture (factory pattern, provider protocol)
- Reuse existing OAuth infrastructure and monitoring
- Maintain backward compatibility during migration
- Preserve all existing LinkedIn features (analytics, publishing, account management)

---

## 1. Architecture Understanding

### 1.1 Current Architecture Overview

The current LinkedIn integration follows a **three-layer architecture**:

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Frontend (React + TypeScript)                       │
│  ├── LinkedInWriter component                                 │
│  ├── useLinkedInSocialConnection hook                       │
│  ├── linkedinSocial.ts API client                           │
│  └── linkedInOAuthConnect.ts OAuth flow                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: Backend API (FastAPI)                             │
│  ├── linkedin_social.py router (MISSING - needs creation)  │
│  ├── linkedin.py router (content generation only)            │
│  └── OAuth callback routes in linkedin_oauth.py              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: Integration Services                              │
│  ├── LinkedInSocialProvider Protocol (abstract)              │
│  ├── ZernioProvider (current implementation)               │
│  ├── NativeLinkedInProvider (stub for future)                │
│  └── LinkedInOAuthService (credential management)          │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Current Data Flow (Zernio)

```
User clicks "Connect LinkedIn"
         │
         ▼
┌─────────────────┐
│ Frontend calls  │ GET /api/linkedin-social/auth/url
│ getLinkedInAuthUrl│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Backend calls   │ LinkedInOAuthService.generate_authorization_url()
│ Zernio API      │ ZernioProvider (via factory)
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Zernio API      │────▶│ LinkedIn OAuth  │
│ creates profile   │     │ (headless mode) │
│ & returns authUrl │     └────────┬────────┘
└─────────────────┘              │
                                 ▼
                          LinkedIn Login Page
                                 │
                    ┌────────────┴────────────┐
                    ▼                         ▼
            User authenticates          User selects
            with LinkedIn               personal vs org
                    │                           │
                    └────────────┬───────────────┘
                                 ▼
                    ┌─────────────────────┐
                    │ Zernio callback     │ POST /api/linkedin-social/callback
                    │ with tempToken      │
                    └──────────┬──────────┘
                               ▼
                    ┌─────────────────────┐
                    │ Backend calls       │ select_linkedin_organization_sync()
                    │ Zernio to finalize  │
                    │ account selection   │
                    └──────────┬──────────┘
                               ▼
                    ┌─────────────────────┐
                    │ Store credentials   │ SQLite per-user DB
                    │ in linkedin_oauth_tokens│
                    └─────────────────────┘
```

### 1.3 Unipile Hosted OAuth Flow (Target)

```
User clicks "Connect LinkedIn"
         │
         ▼
┌──────────────────────────┐
│ Frontend calls           │ GET /api/linkedin-social/auth/url
│ getLinkedInAuthUrl       │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ Backend calls Unipile API  │ POST /api/v1/accounts/create
│ to generate hosted auth    │ with provider_type=LINKEDIN
│ link                       │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ Unipile returns          │ hosted_auth_url + state
│ hosted auth URL          │ (not LinkedIn direct URL)
└──────────┬───────────────┘
           │
           ▼
    ┌──────────────────────────┐
    │ Popup opens Unipile      │ https://{unipile-dsn}/...
    │ hosted auth page         │
    └──────────┬───────────────┘
               │
               ▼
        ┌──────────────────────────┐
        │ Unipile handles          │ OAuth with LinkedIn
        │ LinkedIn OAuth           │ (user sees Unipile UI)
        │ directly                 │
        └──────────┬───────────────┘
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
   Success                 Failure
        │                     │
        ▼                     ▼
┌──────────────┐      ┌──────────────┐
│ Unipile      │      │ Unipile      │
│ redirects to │      │ redirects to │
│ success URL  │      │ failure URL  │
└──────┬───────┘      └──────┬───────┘
       │                     │
       ▼                     ▼
Backend callback      Backend callback
/api/unipile/callback /api/unipile/callback?error=...
       │                     │
       ▼                     ▼
┌──────────────────────────────┐  ┌──────────────────────────────┐
│ Backend receives account_id  │  │ Backend handles error        │
│ from Unipile webhook/        │  │ Store error state            │
│ callback                       │  │ Return error to frontend     │
│ Store in linkedin_oauth_tokens│  │                              │
│ Send success postMessage       │  │                              │
└──────────────────────────────┘  └──────────────────────────────┘
```

---

## 2. Affected Modules & Components

### 2.1 Backend Services (Python)

| File | Current Role | Changes Required |
|------|-------------|------------------|
| `services/integrations/linkedin/zernio_client.py` | Low-level Zernio HTTP client | **DELETE** - Replace with `unipile_client.py` |
| `services/integrations/linkedin/zernio_provider.py` | Zernio implementation of LinkedInSocialProvider | **DELETE** - Replace with `unipile_provider.py` |
| `services/integrations/linkedin/native_provider.py` | Native LinkedIn API stub (future) | **KEEP** - Unchanged |
| `services/integrations/linkedin/protocol.py` | Abstract provider protocol | **KEEP** - Unchanged |
| `services/integrations/linkedin/factory.py` | Provider factory with env-based selection | **MODIFY** - Add 'unipile' option |
| `services/integrations/linkedin_oauth.py` | OAuth service for credential management | **MODIFY** - Add Unipile flow handlers |
| `services/integrations/linkedin/types.py` | Type definitions | **MODIFY** - Add Unipile-specific types |
| `services/integrations/linkedin/account_resolution.py` | Account partitioning logic | **MODIFY** - Adapt for Unipile account structure |
| `services/integrations/linkedin/analytics_dates.py` | Date range utilities | **KEEP** - Unchanged |
| `services/integrations/linkedin/analytics_normalizer.py` | Response normalizer | **MODIFY** - Add Unipile normalizer |
| `services/integrations/linkedin/personal_analytics.py` | Personal analytics fetcher | **MODIFY** - Use Unipile API |
| `services/integrations/linkedin/landing_analytics.py` | Landing page analytics | **MODIFY** - Use Unipile API |
| `services/integrations/linkedin/content_deduplicator.py` | Publish deduplication | **KEEP** - Unchanged |
| `services/integrations/linkedin/media_validator.py` | Media upload validation | **KEEP** - Unchanged |
| `services/integrations/linkedin/publish_preflight.py` | Pre-publish checks | **KEEP** - Unchanged |

### 2.2 Backend Models

| File | Current Role | Changes Required |
|------|-------------|------------------|
| `models/linkedin_social_models.py` | Pydantic models for API responses | **MODIFY** - Add Unipile-specific fields |
| `models/linkedin_models.py` | Content generation models | **KEEP** - Unchanged |
| `models/oauth_token_monitoring_models.py` | Token monitoring tasks | **KEEP** - Unchanged (Unipile uses same table) |

### 2.3 Backend Routers

| File | Current Role | Changes Required |
|------|-------------|------------------|
| `routers/linkedin.py` | Content generation endpoints | **KEEP** - Unchanged |
| `routers/linkedin_social.py` | **MISSING** - Needs creation | **CREATE** - Social/account endpoints |
| `routers/bing_oauth.py` | Bing OAuth pattern reference | **REFERENCE** - Use as template |
| `routers/wordpress_oauth.py` | WordPress OAuth pattern reference | **REFERENCE** - Use as template |

**Note:** Currently, LinkedIn social endpoints are likely embedded in `linkedin_oauth.py` or need to be created as a separate router `linkedin_social.py`.

### 2.4 Frontend Components (React/TypeScript)

| File | Current Role | Changes Required |
|------|-------------|------------------|
| `frontend/src/api/linkedinSocial.ts` | API client for social features | **MODIFY** - Update for Unipile response format |
| `frontend/src/utils/linkedInOAuthConnect.ts` | OAuth popup flow | **MODIFY** - Handle Unipile callback format |
| `frontend/src/hooks/useLinkedInSocialConnection.ts` | Connection state management | **KEEP** - Unchanged (API contract preserved) |
| `frontend/src/hooks/useLinkedInAnalyticsDashboard.ts` | Analytics data fetching | **KEEP** - Unchanged (API contract preserved) |
| `frontend/src/components/LinkedInWriter/components/LinkedInConnectionPlaceholder.tsx` | Connection UI | **KEEP** - Unchanged (uses hook) |
| `frontend/src/components/LinkedInWriter/components/LinkedInConnectedProfile.tsx` | Connected profile display | **KEEP** - Unchanged (uses hook) |
| `frontend/src/components/LinkedInWriter/components/analytics/LinkedInAnalyticsDashboard.tsx` | Analytics dashboard | **KEEP** - Unchanged (uses hook) |

### 2.5 Scheduler & Monitoring

| File | Current Role | Changes Required |
|------|-------------|------------------|
| `services/scheduler/executors/oauth_token_monitoring_executor.py` | Token monitoring executor | **MODIFY** - Add `_check_unipile_token()` method |
| `services/oauth_token_monitoring_service.py` | Token monitoring service | **MODIFY** - Add Unipile platform detection |
| `services/scheduler/__init__.py` | Scheduler initialization | **KEEP** - Unchanged |

### 2.6 Configuration & Environment

| File | Current Role | Changes Required |
|------|-------------|------------------|
| `backend/.env` | Environment variables | **MODIFY** - Replace ZERNIO_API_KEY with UNIPILE_API_KEY, UNIPILE_DSN |
| `frontend/.env` | Frontend environment | **KEEP** - Unchanged (no frontend config for provider) |

---

## 3. Database Schema Changes

### 3.1 Existing Schema (linkedin_oauth_tokens table)

```sql
-- Current SQLite schema (per-user database)
CREATE TABLE linkedin_oauth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    provider_mode TEXT NOT NULL,  -- 'zernio', 'native', ADD: 'unipile'
    zernio_api_key TEXT,            -- REMOVE: Zernio-specific
    zernio_account_id TEXT,         -- RENAME/MODIFY: unipile_account_id
    zernio_org_account_id TEXT,     -- RENAME/MODIFY: unipile_org_account_id
    zernio_profile_id TEXT,         -- REMOVE: Zernio-specific
    linkedin_access_token TEXT,     -- KEEP: For native mode
    linkedin_refresh_token TEXT,    -- KEEP: For native mode
    expires_at TIMESTAMP,
    account_name TEXT,
    profile_urn TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3.2 Proposed Schema Migration

**Option A: Minimal Changes (Recommended)**

```sql
-- Add columns for Unipile (keep Zernio columns for backward compatibility)
ALTER TABLE linkedin_oauth_tokens ADD COLUMN unipile_account_id TEXT;
ALTER TABLE linkedin_oauth_tokens ADD COLUMN unipile_org_account_id TEXT;

-- provider_mode values: 'zernio', 'native', 'unipile'
-- zernio_* columns remain for migration period
```

**Option B: Clean Schema (Post-Migration)**

```sql
-- Create new table with clean schema
CREATE TABLE linkedin_oauth_tokens_v2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    provider_mode TEXT NOT NULL,  -- 'unipile', 'native'
    account_id TEXT NOT NULL,     -- Generic (was zernio_account_id/unipile_account_id)
    org_account_id TEXT,          -- Generic (was zernio_org_account_id/unipile_org_account_id)
    access_token TEXT,            -- For native mode only
    refresh_token TEXT,           -- For native mode only
    expires_at TIMESTAMP,
    account_name TEXT,
    profile_urn TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Migrate data, then drop old table and rename
```

---

## 4. API Route Changes

### 4.1 Existing Routes (Zernio)

| Route | Method | Description |
|-------|--------|-------------|
| `/api/linkedin-social/auth/url` | GET | Get OAuth authorization URL |
| `/api/linkedin-social/callback` | GET/POST | OAuth callback handler |
| `/api/linkedin-social/connection/status` | GET | Check connection status |
| `/api/linkedin-social/accounts` | GET | List connected accounts |
| `/api/linkedin-social/organizations` | GET | List organizations for account |
| `/api/linkedin-social/sync` | POST | Sync accounts from provider |
| `/api/linkedin-social/disconnect` | POST | Disconnect LinkedIn |
| `/api/linkedin-social/analytics/landing` | GET | Landing page analytics |
| `/api/linkedin-social/analytics/personal` | GET | Personal analytics |
| `/api/linkedin-social/analytics/organization` | GET | Organization analytics |

### 4.2 Route Modifications Required

**Route: `/api/linkedin-social/auth/url`**
- **Current:** Returns Zernio auth URL
- **Change:** Return Unipile hosted auth URL
- **Response format:** Same structure (authorization_url, state, provider)

**Route: `/api/linkedin-social/callback`**
- **Current:** Handles Zernio tempToken callback
- **Change:** Handle Unipile success/error callback
- **New parameters:** `account_id`, `status`, `error` (Unipile format)

**Route: `/api/linkedin-social/accounts`**
- **Current:** Returns Zernio account format
- **Change:** Return Unipile account format (may need transformation)

**Route: `/api/unipile/webhook`** (NEW)
- **Purpose:** Receive Unipile webhook notifications for account status changes
- **Method:** POST
- **Payload:** Account status updates, disconnections

---

## 5. Reusable Components

### 5.1 Existing Components to Reuse

| Component | Location | Reuse Strategy |
|-----------|----------|----------------|
| `LinkedInSocialProvider` Protocol | `services/integrations/linkedin/protocol.py` | Implement new UnipileProvider |
| `LinkedInOAuthService` | `services/integrations/linkedin_oauth.py` | Extend with Unipile handlers |
| `ContentDeduplicator` | `services/integrations/linkedin/content_deduplicator.py` | Direct reuse |
| `LinkedInMediaValidator` | `services/integrations/linkedin/media_validator.py` | Direct reuse |
| `OAuth callback utilities` | `services/integrations/oauth_callback_utils.py` | Direct reuse |
| `postMessage OAuth flow` | `frontend/src/utils/linkedInOAuthConnect.ts` | Direct reuse |
| `OAuth token monitoring` | `services/scheduler/executors/oauth_token_monitoring_executor.py` | Add Unipile check method |

### 5.2 New Components to Create

| Component | Location | Purpose |
|-----------|----------|---------|
| `UnipileClient` | `services/integrations/linkedin/unipile_client.py` | Low-level Unipile HTTP client |
| `UnipileProvider` | `services/integrations/linkedin/unipile_provider.py` | Unipile implementation of LinkedInSocialProvider |
| `UnipileWebhookHandler` | `services/integrations/linkedin/unipile_webhook.py` | Handle Unipile webhooks |
| `linkedin_social.py` router | `routers/linkedin_social.py` | Social feature endpoints |

---

## 6. Code to Delete

### 6.1 Files to Delete (Post-Migration)

```
backend/services/integrations/linkedin/zernio_client.py
backend/services/integrations/linkedin/zernio_provider.py
```

### 6.2 Code Blocks to Remove

**In `services/integrations/linkedin/factory.py`:**
- Remove `_zernio_singleton()` function
- Remove `'zernio'` case from `get_linkedin_provider()`

**In `services/integrations/linkedin_oauth.py`:**
- Remove Zernio-specific imports
- Remove `ensure_zernio_profile()` method
- Remove `sync_zernio_accounts()` method
- Remove Zernio callback handlers
- Keep generic OAuth state management (reused by Unipile)

**In `services/scheduler/executors/oauth_token_monitoring_executor.py`:**
- Remove `_check_linkedin_token()` Zernio-specific logic (replace with Unipile version)

**In `.env` files:**
- Remove `ZERNIO_API_KEY`
- Remove `LINKEDIN_PROVIDER=zernio`

---

## 7. Risk Analysis

### 7.1 High-Risk Areas

| Risk | Impact | Mitigation |
|------|--------|------------|
| **OAuth Flow Change** | User auth experience changes | Thorough testing with staging Unipile account |
| **Account ID Format Change** | Existing account references break | Map Zernio → Unipile account IDs during migration |
| **Analytics Data Format** | Dashboard may show incorrect data | Implement response transformation layer |
| **Webhook Reliability** | Unipile webhooks may be missed | Implement polling fallback for status checks |
| **Token Storage Migration** | User re-authentication required | Run parallel systems during transition period |

### 7.2 Medium-Risk Areas

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Rate Limiting Differences** | Unipile may have different limits | Implement adaptive rate limiting |
| **Error Response Formats** | Error handling may need updates | Create error translation layer |
| **Feature Parity** | Unipile may lack some Zernio features | Document feature gaps, implement fallbacks |

### 7.3 Low-Risk Areas

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Frontend Changes** | Minimal UI changes needed | Frontend uses abstracted hooks |
| **Content Generation** | No impact on AI generation | Separate router, no changes needed |

---

## 8. Migration Phases

### Phase 1: Foundation (Sprint 1)

**Goals:**
- Create Unipile client infrastructure
- Implement provider protocol
- Add environment configuration

**Tasks:**
1. Create `unipile_client.py` with basic HTTP client
2. Create `unipile_provider.py` implementing LinkedInSocialProvider
3. Add Unipile credentials to `.env` template
4. Update `factory.py` to support 'unipile' provider mode
5. Add database migration for new columns

**Deliverables:**
- Unipile client with auth URL generation
- Unipile provider skeleton (stubbed methods)
- Database migration script

**Risk Level:** Low
**Rollback:** Simple - just don't set `LINKEDIN_PROVIDER=unipile`

---

### Phase 2: OAuth Flow (Sprint 2)

**Goals:**
- Implement Unipile OAuth flow
- Create callback handlers
- Test authentication end-to-end

**Tasks:**
1. Implement `generate_authorization_url()` in UnipileProvider
2. Create `/api/unipile/callback` route
3. Implement account storage after successful auth
4. Create webhook handler for account updates
5. Test OAuth flow in staging environment

**Deliverables:**
- Working OAuth flow with Unipile
- Account storage in database
- Webhook endpoint

**Risk Level:** Medium
**Rollback:** Switch `LINKEDIN_PROVIDER` back to `zernio`

---

### Phase 3: Analytics Integration (Sprint 3)

**Goals:**
- Implement analytics fetching via Unipile
- Maintain same API response format
- Update dashboard data flow

**Tasks:**
1. Implement `get_profile_aggregate_analytics()` in UnipileProvider
2. Implement `get_org_aggregate_analytics()` in UnipileProvider
3. Create response transformer (Unipile → Zernio format for compatibility)
4. Update analytics endpoints
5. Test analytics dashboard

**Deliverables:**
- Analytics data flowing through Unipile
- Compatible API responses
- Working analytics dashboard

**Risk Level:** High
**Rollback:** May need data transformation layer for mixed providers

---

### Phase 4: Publishing Integration (Sprint 4)

**Goals:**
- Implement publishing via Unipile
- Support media uploads
- Comment/reply functionality

**Tasks:**
1. Implement `create_post()` in UnipileProvider
2. Implement `upload_media()` in UnipileProvider
3. Implement `schedule_post()` in UnipileProvider
4. Implement `list_comments()` and `reply_to_comment()`
5. Test publishing workflows

**Deliverables:**
- Content publishing via Unipile
- Media uploads working
- Comment management working

**Risk Level:** Medium
**Rollback:** Feature flags to disable publishing

---

### Phase 5: Monitoring & Cleanup (Sprint 5)

**Goals:**
- Implement token monitoring for Unipile
- Remove Zernio code
- Documentation updates

**Tasks:**
1. Add `_check_unipile_token()` to OAuthTokenMonitoringExecutor
2. Update `oauth_token_monitoring_service.py` for Unipile detection
3. Delete Zernio client and provider files
4. Remove Zernio-specific code from OAuth service
5. Update documentation

**Deliverables:**
- Token monitoring for Unipile
- Clean codebase without Zernio
- Updated developer documentation

**Risk Level:** Low
**Rollback:** Restore files from git history if needed

---

## 9. Environment Variable Changes

### 9.1 Current (.env)

```bash
# Zernio Configuration
LINKEDIN_PROVIDER=zernio
ZERNIO_API_KEY=sk_...

# OAuth Configuration
BACKEND_URL=https://...
LINKEDIN_SOCIAL_REDIRECT_URI=https://.../api/linkedin-social/callback
FRONTEND_URL=http://localhost:3000
OAUTH_CALLBACK_ALLOWED_ORIGINS=http://localhost:3000
OAUTH_TOKEN_ENCRYPTION_KEY=...
```

### 9.2 New (.env)

```bash
# Unipile Configuration
LINKEDIN_PROVIDER=unipile
UNIPILE_API_KEY=...
UNIPILE_DSN=api1.unipile.com:13211  # or your DSN

# OAuth Configuration (unchanged - Unipile uses these for callback)
BACKEND_URL=https://...
LINKEDIN_SOCIAL_REDIRECT_URI=https://.../api/unipile/callback
FRONTEND_URL=http://localhost:3000
OAUTH_CALLBACK_ALLOWED_ORIGINS=http://localhost:3000
OAUTH_TOKEN_ENCRYPTION_KEY=...

# Legacy (to be removed after migration)
# ZERNIO_API_KEY=sk_...  # REMOVE
```

---

## 10. Testing Strategy

### 10.1 Unit Tests

| Component | Test Coverage |
|-----------|--------------|
| `UnipileClient` | HTTP client, error handling, retry logic |
| `UnipileProvider` | Protocol compliance, method implementations |
| `linkedin_social.py` router | Route handlers, request validation |
| `unipile_webhook.py` | Webhook signature verification, payload parsing |

### 10.2 Integration Tests

| Flow | Test Cases |
|------|-----------|
| OAuth Flow | Auth URL generation, callback handling, error handling |
| Account Sync | List accounts, refresh accounts, handle disconnections |
| Analytics | Personal analytics, org analytics, date ranges |
| Publishing | Create post, upload media, schedule post |
| Webhooks | Account status changes, error notifications |

### 10.3 End-to-End Tests

| Scenario | Steps |
|----------|-------|
| New User Connection | Click connect → OAuth popup → Success → Dashboard shows account |
| Reconnection | Disconnect → Reconnect → Previous settings preserved |
| Analytics View | Load dashboard → Switch date ranges → View org analytics |
| Content Publish | Generate content → Click publish → Confirm on LinkedIn |
| Token Expiration | Wait for token expiry → Verify auto-refresh or notification |

---

## 11. Rollback Plan

### 11.1 Immediate Rollback (Single Command)

```bash
# Switch back to Zernio
export LINKEDIN_PROVIDER=zernio

# Restart services
systemctl restart alwrity-backend
```

### 11.2 Data Rollback (If Needed)

```bash
# Restore from backup if database migration caused issues
sqlite3 user_data.db < backup/linkedin_oauth_tokens_pre_migration.sql
```

### 11.3 Code Rollback (Git)

```bash
# Revert to pre-migration commit
git revert HEAD~5..HEAD  # Adjust range as needed
```

---

## 12. Success Criteria

### 12.1 Technical Success Criteria

- [ ] All existing LinkedIn features work with Unipile
- [ ] OAuth flow completes in < 30 seconds
- [ ] Analytics load in < 5 seconds
- [ ] Publishing latency < 10 seconds
- [ ] Zero data loss during migration
- [ ] 100% of unit tests pass
- [ ] 100% of integration tests pass

### 12.2 Business Success Criteria

- [ ] User authentication success rate > 95%
- [ ] Zero critical bugs in production
- [ ] Support ticket volume < 5 per week related to migration
- [ ] User satisfaction score maintained or improved

---

## 13. Appendices

### Appendix A: Unipile API Reference

**Key Endpoints:**
- `POST /api/v1/accounts/create` - Create account connection
- `GET /api/v1/accounts` - List connected accounts
- `GET /api/v1/accounts/{id}` - Get account details
- `DELETE /api/v1/accounts/{id}` - Disconnect account
- `POST /api/v1/linkedin/posts` - Create LinkedIn post
- `GET /api/v1/linkedin/analytics` - Get analytics

**Documentation:** https://developer.unipile.com/docs/connect-accounts

### Appendix B: Code References

**Existing Zernio Implementation:**
- Client: `backend/services/integrations/linkedin/zernio_client.py`
- Provider: `backend/services/integrations/linkedin/zernio_provider.py`
- OAuth Service: `backend/services/integrations/linkedin_oauth.py`

**Pattern References:**
- WordPress OAuth: `backend/routers/wordpress_oauth.py`
- Bing OAuth: `backend/routers/bing_oauth.py`
- OAuth Monitoring: `backend/services/scheduler/executors/oauth_token_monitoring_executor.py`

### Appendix C: Database Migrations

**Migration Script Template:**

```python
# backend/migrations/001_add_unipile_support.py
"""
Migration: Add Unipile LinkedIn support
"""
import sqlite3
import os
from loguru import logger

def migrate_user_db(db_path: str):
    """Add Unipile columns to user's linkedin_oauth_tokens table."""
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        
        # Check if columns already exist
        cursor.execute("PRAGMA table_info(linkedin_oauth_tokens)")
        columns = {row[1] for row in cursor.fetchall()}
        
        if 'unipile_account_id' not in columns:
            cursor.execute("""
                ALTER TABLE linkedin_oauth_tokens 
                ADD COLUMN unipile_account_id TEXT
            """)
            logger.info(f"Added unipile_account_id to {db_path}")
        
        if 'unipile_org_account_id' not in columns:
            cursor.execute("""
                ALTER TABLE linkedin_oauth_tokens 
                ADD COLUMN unipile_org_account_id TEXT
            """)
            logger.info(f"Added unipile_org_account_id to {db_path}")
        
        conn.commit()

def run_migration():
    """Run migration for all user databases."""
    # Find all user databases
    user_data_dir = os.environ.get('USER_DATA_DIR', './user_data')
    
    for user_dir in os.listdir(user_data_dir):
        db_path = os.path.join(user_data_dir, user_dir, 'data.db')
        if os.path.exists(db_path):
            try:
                migrate_user_db(db_path)
            except Exception as e:
                logger.error(f"Failed to migrate {db_path}: {e}")

if __name__ == '__main__':
    run_migration()
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-06-18 | Architecture Review | Initial migration plan |

---

**End of Document**
