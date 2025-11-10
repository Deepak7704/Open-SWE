# GitHub OAuth + Webhook Implementation Guide

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [What We're Building](#what-were-building)
4. [Current Progress](#current-progress)
5. [Complete Implementation Steps](#complete-implementation-steps)
6. [File Structure](#file-structure)
7. [Code Implementation](#code-implementation)
8. [Testing Guide](#testing-guide)
9. [Troubleshooting](#troubleshooting)

---

## Project Overview

**Goal**: Build a GitHub OAuth system where users can:
1. Connect their GitHub account
2. Select repositories to enable AI features
3. Automatically re-index repositories when code changes (via webhooks)
4. Create PRs under their own name (not yours)

**Why This Matters**:
- ❌ **Current**: Using your personal GitHub token for everyone → All PRs appear as "by you"
- ✅ **Target**: Each user has their own token → PRs appear under their name

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER JOURNEY                             │
└─────────────────────────────────────────────────────────────────┘

1. User visits login page
   ↓
2. Clicks "Connect with GitHub"
   ↓
3. Redirected to backend OAuth endpoint
   ↓
4. Backend redirects to GitHub authorization page
   ↓
5. User authorizes app on GitHub
   ↓
6. GitHub redirects to backend callback with code
   ↓
7. Backend exchanges code for access token
   ↓
8. Backend fetches user info from GitHub
   ↓
9. Backend saves user + token to database (encrypted)
   ↓
10. Backend redirects to frontend dashboard
   ↓
11. User selects repositories to enable
   ↓
12. Backend creates webhooks on selected repos (using user's token)
   ↓
13. User pushes code → GitHub webhook fires → Auto re-index
```

---

## What We're Building

### **Feature 1: GitHub OAuth**
Allow users to connect their GitHub account so we can:
- Access their repositories
- Create PRs under their name
- Use their permissions

### **Feature 2: Webhook System**
Automatically trigger re-indexing when:
- User pushes code to a branch
- User creates/updates a pull request
- Any code changes occur

### **Feature 3: Per-User Token Management**
- Store each user's GitHub token securely (encrypted)
- Use their token for GitHub API calls
- Revoke access when user logs out

---

## Current Progress

### ✅ Completed

1. **Webhook Route** (`primary_backend/routes/webhook.ts`)
   - Receives GitHub webhook events (push, PR, etc.)
   - Verifies webhook signatures
   - Queues indexing jobs
   - Handles multiple event types

2. **Server Configuration** (`primary_backend/src/server.ts`)
   - Raw body parser for signature verification
   - Webhook route mounted at `/webhook`
   - Port changed to 8000 (to avoid Next.js conflict)

3. **Frontend Login Page** (`frontend/app/login/page.tsx`)
   - "Connect with GitHub" button
   - Error handling
   - Loading states
   - Auto-redirect if already logged in

4. **Environment Setup**
   - Backend `.env` configured with webhook secret
   - Frontend `.env.local` with backend URL

### 🚧 In Progress / Next Steps

1. **Backend OAuth Routes** (`primary_backend/routes/auth.ts`)
   - Start OAuth flow
   - Handle GitHub callback
   - Exchange code for token
   - Fetch user info

2. **Frontend Dashboard** (`frontend/app/dashboard/page.tsx`)
   - Display user info
   - Show repositories
   - Enable/disable repos for AI

3. **Database Setup**
   - Users table
   - GitHub tokens table (encrypted)
   - Repositories table
   - Webhook configs table

4. **Token Encryption**
   - Encrypt tokens before storing
   - Decrypt when making API calls

5. **Repository Management**
   - List user's repos
   - Create webhooks on selected repos
   - Enable/disable AI features per repo

---

## Complete Implementation Steps

### **Phase 1: Backend OAuth (Current Focus)**

#### Step 1: Register GitHub OAuth App

1. Go to: https://github.com/settings/developers
2. Click **"OAuth Apps"** → **"New OAuth App"**
3. Fill in:
   ```
   Application name: OpenSWE Dev
   Homepage URL: http://localhost:3000
   Authorization callback URL: http://localhost:8000/auth/github/callback
   Application description: AI-powered code generation
   ```
4. Click **"Register application"**
5. Save **Client ID**
6. Click **"Generate a new client secret"**
7. Save **Client Secret** (you can only see it once!)

#### Step 2: Update Environment Variables

Add to `primary_backend/.env`:
```env
# Existing variables
PORT = 8000
REDIS_HOST = localhost
REDIS_PORT = 6379
REDIS_PASSWORD=password
GOOGLE_GENERATIVE_AI_API_KEY = "AIzaSyC5ryCzQ_rjPwsnUEmaazHUyK4K-9Jp2jI"
GITHUB_WEBHOOK_SECRET = "hemanth"

# NEW: GitHub OAuth
GITHUB_CLIENT_ID=Iv1.YOUR_CLIENT_ID_HERE
GITHUB_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
GITHUB_CALLBACK_URL=http://localhost:8000/auth/github/callback
FRONTEND_URL=http://localhost:3000
```

#### Step 3: Create Auth Route

**File**: `primary_backend/routes/auth.ts`

**Purpose**: Handles OAuth flow
- `GET /auth/github/login` - Start OAuth, redirect to GitHub
- `GET /auth/github/callback` - Handle GitHub callback, exchange code for token
- `POST /auth/logout` - Logout user
- `GET /auth/status` - Check auth status

**Key Features**:
- CSRF protection using state parameter
- Error handling with user-friendly messages
- Automatic cleanup of expired states
- Detailed logging for debugging

**Implementation**: See "Code Implementation" section below

#### Step 4: Update server.ts

Add to `primary_backend/src/server.ts`:

```typescript
// Add import at top (around line 6)
import authRoute from '../routes/auth';

// Add route before error handler (around line 162)
app.use('/auth', authRoute);

// Update startup logs (around line 177)
console.log(`GET /auth/github/login - Start OAuth flow`);
console.log(`GET /auth/github/callback - OAuth callback`);
```

#### Step 5: Test OAuth Flow

1. Start backend: `cd primary_backend && bun run dev`
2. Start frontend: `cd frontend && npm run dev`
3. Visit: http://localhost:3000/login
4. Click "Continue with GitHub"
5. Should redirect to GitHub
6. Click "Authorize"
7. Should redirect to dashboard

---

### **Phase 2: Frontend Dashboard**

#### Step 1: Create Dashboard Page

**File**: `frontend/app/dashboard/page.tsx`

**Purpose**: Show user info after login
- Display GitHub username, avatar
- Show list of repositories
- Allow enabling/disabling repos

**Key Features**:
- Extract user data from URL or localStorage
- Fetch user's repositories from backend
- Enable/disable AI features per repo
- Show indexing status

#### Step 2: Create Repository List Component

**File**: `frontend/components/RepositoryList.tsx`

**Purpose**: Display and manage repositories
- List all user repos
- Toggle AI features on/off
- Show indexing progress
- Create webhooks when enabled

---

### **Phase 3: Database Setup**

#### Step 1: Choose Database

Options:
- **PostgreSQL** (Recommended for production)
- **SQLite** (Good for development)
- **MySQL/MariaDB**

#### Step 2: Set Up Database Schema

**Tables needed**:

```sql
-- Users
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  github_id INTEGER UNIQUE NOT NULL,
  username VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- GitHub Tokens (encrypted!)
CREATE TABLE github_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  encrypted_token TEXT NOT NULL,
  scope TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  UNIQUE(user_id)
);

-- Repositories
CREATE TABLE repositories (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  github_repo_id INTEGER NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  private BOOLEAN DEFAULT false,
  default_branch VARCHAR(100) DEFAULT 'main',
  enabled BOOLEAN DEFAULT false,
  webhook_id INTEGER,
  last_indexed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Webhook Configurations
CREATE TABLE webhook_configs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  repository_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
  github_webhook_id INTEGER NOT NULL,
  webhook_url TEXT NOT NULL,
  events TEXT[] DEFAULT ARRAY['push', 'pull_request'],
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(repository_id)
);
```

#### Step 3: Install Database Library

Choose one:

**Option A: Prisma (Recommended)**
```bash
cd primary_backend
npm install prisma @prisma/client
npx prisma init
```

**Option B: TypeORM**
```bash
npm install typeorm pg reflect-metadata
```

**Option C: Raw SQL with pg**
```bash
npm install pg
npm install -D @types/pg
```

---

### **Phase 4: Token Encryption**

#### Why Encryption?
- GitHub tokens are sensitive
- If database leaks, tokens stay safe
- Encryption key stored separately

#### Implementation

**File**: `primary_backend/lib/encryption.ts`

```typescript
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY!, 'hex');

export function encryptToken(token: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptToken(encryptedToken: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedToken.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

**Generate encryption key**:
```bash
openssl rand -hex 32
```

Add to `.env`:
```env
TOKEN_ENCRYPTION_KEY=your_64_character_hex_string
```

---

### **Phase 5: Repository Management**

#### Step 1: List User Repositories

**Endpoint**: `GET /user/repos`

```typescript
router.get('/repos', async (req, res) => {
  const userId = req.session.userId; // From session/JWT

  // Get user's token from database
  const user = await getUserById(userId);
  const token = decryptToken(user.encryptedToken);

  // Fetch repos from GitHub
  const response = await fetch('https://api.github.com/user/repos', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  const repos = await response.json();

  res.json({ repos });
});
```

#### Step 2: Enable Repository (Create Webhook)

**Endpoint**: `POST /repos/enable`

```typescript
router.post('/repos/enable', async (req, res) => {
  const { repoFullName } = req.body; // e.g., "owner/repo"
  const userId = req.session.userId;

  // Get user's token
  const user = await getUserById(userId);
  const token = decryptToken(user.encryptedToken);

  // Create webhook on user's repository
  const webhookResponse = await fetch(
    `https://api.github.com/repos/${repoFullName}/hooks`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        config: {
          url: 'https://your-domain.com/webhook/github',
          content_type: 'json',
          secret: process.env.GITHUB_WEBHOOK_SECRET,
        },
        events: ['push', 'pull_request'],
        active: true,
      }),
    }
  );

  const webhook = await webhookResponse.json();

  // Save webhook config to database
  await saveWebhookConfig({
    userId,
    repoFullName,
    webhookId: webhook.id,
  });

  // Queue initial indexing
  await indexingQueue.add('index-repo', {
    repoFullName,
    userId,
    userToken: token,
    trigger: 'manual',
  });

  res.json({ success: true, webhookId: webhook.id });
});
```

---

### **Phase 6: Enhanced Webhook Handler**

Update existing webhook route to work with per-user tokens:

```typescript
router.post('/github', async (req, res) => {
  // ... existing signature verification ...

  const repoFullName = body.repository?.full_name;

  // Find which user owns this repository
  const repoConfig = await findRepositoryByFullName(repoFullName);

  if (!repoConfig) {
    console.log(`⚠️  Repository not registered: ${repoFullName}`);
    return res.status(200).json({ message: 'Repository not registered' });
  }

  // Get user's token
  const user = await getUserById(repoConfig.userId);
  const userToken = decryptToken(user.encryptedToken);

  // Queue indexing job with user's token
  switch (event) {
    case 'push':
      const branch = body.ref?.replace('refs/heads/', '');

      await indexingQueue.add('index-repo', {
        repoFullName,
        branch,
        userId: repoConfig.userId,
        userToken, // Use user's token!
        trigger: 'webhook',
        event: 'push',
      });

      break;
  }
});
```

---

## File Structure

```
OpenSWE/
├── primary_backend/
│   ├── routes/
│   │   ├── auth.ts              ✅ OAuth flow (CREATE THIS NEXT)
│   │   ├── webhook.ts           ✅ Webhook handler (DONE)
│   │   ├── user.ts              ⏳ User management (TODO)
│   │   └── repos.ts             ⏳ Repository management (TODO)
│   │
│   ├── lib/
│   │   ├── encryption.ts        ⏳ Token encryption (TODO)
│   │   └── github.ts            ⏳ GitHub API helpers (TODO)
│   │
│   ├── src/
│   │   └── server.ts            ✅ Main server (UPDATED)
│   │
│   └── .env                     🔄 Environment variables (UPDATE)
│
├── frontend/
│   ├── app/
│   │   ├── login/
│   │   │   └── page.tsx         ✅ Login page (DONE)
│   │   │
│   │   ├── dashboard/
│   │   │   └── page.tsx         ⏳ Dashboard (TODO)
│   │   │
│   │   └── layout.tsx           ✅ Root layout (EXISTS)
│   │
│   ├── components/
│   │   ├── GitHubButton.tsx     ⏳ Connect button (TODO)
│   │   └── RepositoryList.tsx   ⏳ Repo list (TODO)
│   │
│   ├── lib/
│   │   └── auth.ts              ⏳ Auth helpers (TODO)
│   │
│   └── .env.local               ✅ Frontend config (DONE)
│
└── worker/                      ✅ Existing worker (NO CHANGES NEEDED)
```

**Legend**:
- ✅ Done
- 🔄 Needs update
- ⏳ To do

---

## Code Implementation

### **1. Auth Route (PRIMARY FOCUS)**

**File**: `primary_backend/routes/auth.ts`

```typescript
import { Router } from 'express';
import crypto from 'crypto';

const router = Router();

// ============================================
// State Management (CSRF Protection)
// ============================================

const oauthStates = new Map<string, {
  timestamp: number;
  userId?: string;
}>();

function generateState(userId?: string): string {
  const state = crypto.randomBytes(32).toString('hex');
  oauthStates.set(state, {
    timestamp: Date.now(),
    userId: userId,
  });
  console.log(`🔐 Generated OAuth state: ${state.substring(0, 10)}...`);
  return state;
}

function verifyState(state: string): boolean {
  const stored = oauthStates.get(state);

  if (!stored) {
    console.error('❌ State not found - possible CSRF attack');
    return false;
  }

  const age = Date.now() - stored.timestamp;
  const maxAge = 10 * 60 * 1000; // 10 minutes

  if (age > maxAge) {
    console.error('❌ State expired');
    oauthStates.delete(state);
    return false;
  }

  oauthStates.delete(state);
  console.log('✅ State verified');
  return true;
}

// Cleanup expired states every 15 minutes
setInterval(() => {
  const now = Date.now();
  const maxAge = 15 * 60 * 1000;
  let cleaned = 0;

  for (const [state, data] of oauthStates.entries()) {
    if (now - data.timestamp > maxAge) {
      oauthStates.delete(state);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`🧹 Cleaned up ${cleaned} expired OAuth states`);
  }
}, 15 * 60 * 1000);

// ============================================
// OAuth Routes
// ============================================

/**
 * Start OAuth Flow
 * GET /auth/github/login
 */
router.get('/github/login', (req, res) => {
  console.log('\n🚀 Starting GitHub OAuth flow...');

  const state = generateState();
  const githubAuthUrl = 'https://github.com/login/oauth/authorize';

  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID!,
    redirect_uri: process.env.GITHUB_CALLBACK_URL!,
    scope: 'repo,user,admin:repo_hook',
    state: state,
    allow_signup: 'true',
  });

  const fullAuthUrl = `${githubAuthUrl}?${params}`;
  console.log('📤 Redirecting to GitHub...');

  res.redirect(fullAuthUrl);
});

/**
 * Handle OAuth Callback
 * GET /auth/github/callback
 */
router.get('/github/callback', async (req, res) => {
  try {
    console.log('\n📥 Received OAuth callback from GitHub');

    const { code, state, error, error_description } = req.query;

    // Handle user denial
    if (error) {
      console.error('❌ OAuth error:', error);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const errorMsg = encodeURIComponent(error_description as string || 'Authorization failed');
      return res.redirect(`${frontendUrl}/login?error=${errorMsg}`);
    }

    // Validate parameters
    if (!code || !state) {
      console.error('❌ Missing code or state');
      return res.status(400).json({ error: 'Missing parameters' });
    }

    console.log('📦 Code:', (code as string).substring(0, 10) + '...');
    console.log('📦 State:', (state as string).substring(0, 10) + '...');

    // Verify CSRF protection
    if (!verifyState(state as string)) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/login?error=Invalid%20state`);
    }

    // Exchange code for token
    console.log('🔄 Exchanging code for token...');

    const tokenResponse = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code: code,
          redirect_uri: process.env.GITHUB_CALLBACK_URL,
        }),
      }
    );

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('❌ Token exchange error:', tokenData);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const errorMsg = encodeURIComponent(tokenData.error_description || 'Token exchange failed');
      return res.redirect(`${frontendUrl}/login?error=${errorMsg}`);
    }

    const { access_token, scope, token_type } = tokenData;

    console.log('✅ Access token received!');
    console.log('   Token type:', token_type);
    console.log('   Scopes:', scope);

    // Fetch user info
    console.log('👤 Fetching user info...');

    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!userResponse.ok) {
      console.error('❌ Failed to fetch user:', userResponse.statusText);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/login?error=Failed%20to%20fetch%20user`);
    }

    const githubUser = await userResponse.json();

    console.log('✅ User info received:');
    console.log('   ID:', githubUser.id);
    console.log('   Username:', githubUser.login);
    console.log('   Email:', githubUser.email || 'Not provided');

    // Prepare user data
    const userData = {
      githubId: githubUser.id,
      username: githubUser.login,
      email: githubUser.email,
      name: githubUser.name,
      avatarUrl: githubUser.avatar_url,
      accessToken: access_token,
      scope: scope,
      tokenType: token_type,
    };

    // TODO: Save to database
    console.log('💾 TODO: Save user to database');
    console.log('🔐 TODO: Encrypt access token');

    // TEMPORARY: Base64 encode (NOT SECURE for production!)
    const userToken = Buffer.from(JSON.stringify(userData)).toString('base64');

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const redirectUrl = `${frontendUrl}/dashboard?auth=${userToken}`;

    console.log('✅ OAuth complete!');
    console.log('📤 Redirecting to dashboard...');

    res.redirect(redirectUrl);

  } catch (error: any) {
    console.error('❌ Callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/login?error=Internal%20error`);
  }
});

/**
 * Logout
 * POST /auth/logout
 */
router.post('/logout', async (req, res) => {
  // TODO: Implement
  console.log('🚪 User logged out');
  res.json({ success: true });
});

/**
 * Check Status
 * GET /auth/status
 */
router.get('/status', (req, res) => {
  // TODO: Check session
  res.json({ authenticated: false });
});

export default router;
```

### **2. Server.ts Updates**

Add these lines to `primary_backend/src/server.ts`:

```typescript
// At top with other imports (around line 6)
import authRoute from '../routes/auth';

// Before error handler (around line 162)
app.use('/auth', authRoute);

// In startup logs (around line 177)
console.log(`GET /auth/github/login - Start OAuth flow`);
console.log(`GET /auth/github/callback - OAuth callback`);
console.log(`POST /auth/logout - Logout`);
console.log(`GET /auth/status - Auth status`);
```

### **3. Frontend .env.local**

Create/update `frontend/.env.local`:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

---

## Testing Guide

### **Test 1: OAuth Flow**

1. **Start services**:
   ```bash
   # Terminal 1: Backend
   cd primary_backend
   bun run dev

   # Terminal 2: Frontend
   cd frontend
   npm run dev
   ```

2. **Visit login page**: http://localhost:3000/login

3. **Click "Continue with GitHub"**

4. **Expected flow**:
   ```
   Login page → Backend → GitHub → Authorize → Callback → Dashboard
   ```

5. **Check backend logs**:
   ```
   🚀 Starting GitHub OAuth flow...
   📤 Redirecting to GitHub...
   📥 Received OAuth callback from GitHub
   ✅ State verified
   🔄 Exchanging code for token...
   ✅ Access token received!
   👤 Fetching user info...
   ✅ User info received
   📤 Redirecting to dashboard...
   ```

### **Test 2: Error Handling**

1. **Click "Cancel" on GitHub**: Should redirect to login with error message

2. **Invalid state**: Should reject with "Invalid state" error

3. **Network error**: Should show "Internal error" message

### **Test 3: Webhook (Existing)**

1. **Register webhook** (manual for now):
   ```bash
   curl -X POST https://api.github.com/repos/OWNER/REPO/hooks \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{
       "config": {
         "url": "http://localhost:8000/webhook/github",
         "content_type": "json",
         "secret": "hemanth"
       },
       "events": ["push"]
     }'
   ```

2. **Push code**:
   ```bash
   git commit -m "Test webhook" --allow-empty
   git push
   ```

3. **Check backend logs**:
   ```
   📥 Webhook: push for owner/repo
   ✅ Signature verified
   📦 Push to branch: main
   ✅ Indexing job queued: 12345
   ```

---

## Troubleshooting

### **Issue: "State not found" error**

**Cause**: State expired or server restarted

**Solution**:
- Increase state expiration time
- Use Redis for state storage (production)
- Try OAuth flow again

---

### **Issue: "Invalid signature" on webhook**

**Cause**: Webhook secret mismatch

**Solution**:
- Check `GITHUB_WEBHOOK_SECRET` in `.env`
- Verify webhook configuration on GitHub
- Ensure using raw body for verification

---

### **Issue: GitHub OAuth shows "Redirect URI mismatch"**

**Cause**: Callback URL doesn't match GitHub app settings

**Solution**:
- Check GitHub app settings: https://github.com/settings/developers
- Ensure callback URL is: `http://localhost:8000/auth/github/callback`
- Update `.env`: `GITHUB_CALLBACK_URL=http://localhost:8000/auth/github/callback`

---

### **Issue: Frontend can't reach backend**

**Cause**: Wrong backend URL

**Solution**:
- Check `frontend/.env.local`: `NEXT_PUBLIC_BACKEND_URL=http://localhost:8000`
- Restart frontend dev server
- Check backend is running on port 8000

---

### **Issue: CORS errors**

**Cause**: CORS not configured for frontend

**Solution**:
- Update `server.ts`:
  ```typescript
  app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true,
  }));
  ```

---

## Next Steps After OAuth Works

1. **Set up database** (PostgreSQL/SQLite)
2. **Implement token encryption**
3. **Save users to database**
4. **Create dashboard page**
5. **Build repository list**
6. **Add webhook creation per repo**
7. **Implement logout**
8. **Add session management** (JWT or cookies)
9. **Deploy to production**

---

## Production Checklist

Before deploying:

- [ ] Use Redis for OAuth state storage
- [ ] Encrypt all tokens in database
- [ ] Use HTTPS everywhere
- [ ] Add rate limiting
- [ ] Implement proper session management
- [ ] Add logging (Sentry, Datadog)
- [ ] Set up monitoring
- [ ] Create backup strategy
- [ ] Add health checks
- [ ] Document API endpoints
- [ ] Write tests
- [ ] Set up CI/CD

---

## Resources

- **GitHub OAuth Docs**: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps
- **GitHub Webhooks Docs**: https://docs.github.com/en/webhooks
- **GitHub API Docs**: https://docs.github.com/en/rest
- **Next.js Docs**: https://nextjs.org/docs
- **Express Docs**: https://expressjs.com/

---

## Summary

**What You Have**:
- ✅ Webhook system that receives GitHub events
- ✅ Frontend login page
- ✅ Backend structure ready

**What's Next**:
1. Create `routes/auth.ts` (OAuth flow)
2. Register GitHub OAuth app
3. Update `.env` with credentials
4. Test OAuth flow
5. Build dashboard
6. Set up database
7. Connect everything together

**The Goal**:
Users connect GitHub → Select repos → Auto-indexing on every push → AI features work with their repos under their name

---

**Ready to implement?** Start with creating `routes/auth.ts` and registering the GitHub OAuth app!
