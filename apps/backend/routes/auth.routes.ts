import { Router } from "express";
import type { Request, Response } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { Octokit } from '@octokit/rest';
import { createSession, deleteSession, verifySession } from '../lib/session_manager';
import { generateSessionToken } from '../lib/jwt_manager';

const router = Router();

// Configuration from environment variables
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/auth/github/callback';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';

if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    throw new Error('GitHub OAuth credentials (GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET) must be set!');
}

// CSRF protection: Store temporary OAuth states
const oauthStates = new Map<string, {
    timestamp: number;
    userId?: string;
}>();

// Cleanup expired states every 10 minutes
setInterval(() => {
const now = Date.now();
const FIFTEEN_MINUTES = 15 * 60 * 1000;

for (const [state, data] of oauthStates.entries()) {
    if (now - data.timestamp > FIFTEEN_MINUTES) {
        oauthStates.delete(state);
    }
}
}, 10 * 60 * 1000);

function generateOAuthState(): string {
    return crypto.randomBytes(32).toString('base64url');
}

// ROUTE 1: Initiate OAuth flow
router.get('/github/login', (req: Request, res: Response) => {
try {
    console.log('[OAuth] Initiating GitHub OAuth flow');

    const state = generateOAuthState();
    oauthStates.set(state, { timestamp: Date.now() });

    const params = new URLSearchParams({
        client_id: GITHUB_CLIENT_ID!,
        redirect_uri: GITHUB_CALLBACK_URL,
        scope: 'user:email read:user',
        state: state,
        allow_signup: 'true'
    });

    const githubAuthUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
    console.log(`[OAuth] Redirecting to GitHub with state: ${state}`);

    res.redirect(githubAuthUrl);

} catch (error: any) {
    console.error('[OAuth] Error initiating OAuth:', error);
    const errorUrl = `${FRONTEND_URL}/login?error=${encodeURIComponent(error.message)}`;
    res.redirect(errorUrl);
}
});

// ROUTE 2: OAuth callback from GitHub
router.get('/github/callback', async (req: Request, res: Response) => {
try {
    const { code, state, error } = req.query;

    if (error) {
        console.log(`[OAuth] User denied access: ${error}`);
        const errorUrl = `${FRONTEND_URL}/login?error=access_denied`;
        return res.redirect(errorUrl);
    }

    if (!code || !state) {
        throw new Error('Missing code or state parameter');
    }

    console.log('[OAuth] Received callback from GitHub');

    // Verify CSRF state
    const storedState = oauthStates.get(state as string);
    if (!storedState) {
        throw new Error('Invalid or expired state parameter');
    }
    oauthStates.delete(state as string);
    console.log('[OAuth] State verified successfully');

    // Exchange code for access token
    console.log('[OAuth] Exchanging code for access token');
    const tokenResponse = await axios.post(
        'https://github.com/login/oauth/access_token',
        {
            client_id: GITHUB_CLIENT_ID,
            client_secret: GITHUB_CLIENT_SECRET,
            code: code,
            redirect_uri: GITHUB_CALLBACK_URL
        },
        {
            headers: { Accept: 'application/json' }
        }
    );

    const { access_token, error: tokenError } = tokenResponse.data;
    if (tokenError || !access_token) {
        throw new Error(`GitHub OAuth error: ${tokenError || 'No access token received'}`);
    }
    console.log('[OAuth] Access token received');

    // Create Octokit instance with user's access token
    const octokit = new Octokit({ auth: access_token });

    // Fetch user profile using Octokit
    console.log('[OAuth] Fetching user information from GitHub');
    const { data: githubUser } = await octokit.rest.users.getAuthenticated();
    console.log(`[OAuth] User authenticated: ${githubUser.login} (ID: ${githubUser.id})`);

    // Get email if not in profile
    let email = githubUser.email;
    if (!email) {
        console.log('[OAuth] Email not in profile, fetching from emails endpoint');
        const { data: emails } = await octokit.rest.users.listEmailsForAuthenticated();

        const primaryEmail = emails.find(e => e.primary && e.verified);
        email = primaryEmail?.email || emails[0]?.email || 'noemail@github.com';
    }

    // Create session in Redis
    console.log('[OAuth] Creating session in Redis');
    const sessionId = await createSession({
        userId: githubUser.id,
        username: githubUser.login,
        email: email!,
        githubAccessToken: access_token,
        name: githubUser.name,
        avatar: githubUser.avatar_url,
        profileUrl: githubUser.html_url
    });
    console.log(`[OAuth] Session created: ${sessionId}`);

    // Generate JWT token
    const jwtToken = generateSessionToken(sessionId, githubUser.id);
    console.log('[OAuth] JWT token generated');

    // Prepare user data for frontend
    const userData = {
        id: githubUser.id,
        username: githubUser.login,
        email: email,
        name: githubUser.name,
        avatar: githubUser.avatar_url,
        profileUrl: githubUser.html_url
    };

    // Redirect to frontend with token and user data
    const redirectUrl = new URL(`${FRONTEND_URL}/auth/callback`);
    redirectUrl.searchParams.set('token', jwtToken);
    redirectUrl.searchParams.set('user', JSON.stringify(userData));

    console.log('[OAuth] Redirecting to frontend with token');
    res.redirect(redirectUrl.toString());

} catch (error: any) {
    console.error('[OAuth] Callback error:', error);
    const errorMessage = error.message || 'Authentication failed';
    const errorUrl = `${FRONTEND_URL}/login?error=${encodeURIComponent(errorMessage)}`;
    res.redirect(errorUrl);
}
});

// ROUTE 3: Get current user info
router.get('/me', async (req: Request, res: Response) => {
try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.replace('Bearer ', '');

    const { verifySessionToken } = require('../lib/jwt_manager');
    const decoded = verifySessionToken(token);

    const session = await verifySession(decoded.sessionId);

    res.json({
        userId: session.userId,
        username: session.username,
        email: session.email,
        name: session.name,
        avatar: session.avatar,
        profileUrl: session.profileUrl,
        sessionId: session.sessionId,
        createdAt: session.createdAt,
        expiresAt: session.expiredAt
    });

} catch (error: any) {
    console.error('[Auth] /me error:', error);
    res.status(401).json({ error: error.message || 'Unauthorized' });
}
});

// ROUTE 4: Logout
router.post('/logout', async (req: Request, res: Response) => {
try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.replace('Bearer ', '');

    const { verifySessionToken } = require('../lib/jwt_manager');
    const decoded = verifySessionToken(token);

    const deleted = await deleteSession(decoded.sessionId);

    if (deleted) {
        console.log(`[Auth] User logged out, session ${decoded.sessionId} deleted`);
        res.json({ message: 'Logged out successfully' });
    } else {
        res.json({ message: 'Session already expired' });
    }

} catch (error: any) {
    console.error('[Auth] Logout error:', error);
    res.status(500).json({ error: error.message || 'Logout failed' });
}
});

// ROUTE 5: Refresh JWT token
router.post('/refresh', async (req: Request, res: Response) => {
try {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ error: 'Token required' });
    }

    const { refreshSessionToken } = require('../lib/jwt_manager');
    const newToken = refreshSessionToken(token);

    res.json({
        token: newToken,
        message: 'Token refreshed successfully'
    });

} catch (error: any) {
    console.error('[Auth] Token refresh error:', error);
    res.status(401).json({ error: error.message || 'Token refresh failed' });
}
});

// ROUTE 6: Get user's GitHub repositories
router.get('/repos', async (req: Request, res: Response) => {
try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.replace('Bearer ', '');

    const { verifySessionToken } = require('../lib/jwt_manager');
    const decoded = verifySessionToken(token);

    const session = await verifySession(decoded.sessionId);

    // Use GitHub access token from session to fetch repos
    const octokit = new Octokit({ auth: session.githubAccessToken });

    console.log(`[Auth] Fetching repositories for user ${session.username}`);

    // Fetch all repos the user has access to
    const { data: repos } = await octokit.rest.repos.listForAuthenticatedUser({
        sort: 'updated',
        per_page: 100,
        affiliation: 'owner,collaborator,organization_member'
    });

    // Format repos for frontend
    const formattedRepos = repos.map(repo => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        html_url: repo.html_url,
        description: repo.description,
        private: repo.private,
        language: repo.language,
        updated_at: repo.updated_at,
        defaultBranch: repo.default_branch,
        owner: {
            login: repo.owner.login,
            avatar_url: repo.owner.avatar_url
        }
    }));

    console.log(`[Auth] Found ${formattedRepos.length} repositories for user ${session.username}`);

    res.json({ repos: formattedRepos });

} catch (error: any) {
    console.error('[Auth] /repos error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch repositories' });
}
});

export default router;
