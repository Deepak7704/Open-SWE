import crypto from 'crypto';
import jwt from 'jsonwebtoken';

interface GitHubAppConfig {
  appId: string;
  privateKey: string;
  webhookSecret: string;
}

interface InstallationToken {
  token: string;
  expiresAt: string;
  permissions: Record<string, string>;
  repositorySelection: string;
}

class GitHubApp {
  private appId: string;
  private privateKey: string;
  private webhookSecret: string;

  constructor(config: GitHubAppConfig) {
    this.appId = config.appId;
    this.privateKey = config.privateKey;
    this.webhookSecret = config.webhookSecret;
  }

  private generateJWT(): string {
    const now = Math.floor(Date.now() / 1000);

    const payload = {
      iat: now - 60,
      exp: now + (10 * 60),
      iss: this.appId,
    };

    return jwt.sign(payload, this.privateKey, { algorithm: 'RS256' });
  }

  async getInstallationToken(installationId: number): Promise<string> {
    const appJWT = this.generateJWT();

    console.log(`[GitHub App] Generating token for installation ${installationId}`);

    const response = await fetch(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${appJWT}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error(`[GitHub App] Failed to get token:`, error);
      throw new Error(`Failed to get installation token: ${response.statusText}`);
    }

    const data = await response.json() as InstallationToken;

    console.log(`[GitHub App] Token generated (expires: ${data.expiresAt})`);

    return data.token;
  }

  verifyWebhookSignature(payload: Buffer, signature: string): boolean {
    if (!signature) return false;

    const hmac = crypto.createHmac('sha256', this.webhookSecret);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  async getInstallationClient(installationId: number) {
    const token = await this.getInstallationToken(installationId);

    return {
      token,

      async createPullRequest(owner: string, repo: string, params: {
        title: string;
        body: string;
        head: string;
        base: string;
      }) {
        const response = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/pulls`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
            },
            body: JSON.stringify(params),
          }
        );

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Failed to create PR: ${error}`);
        }

        return await response.json();
      },

      async getRepository(owner: string, repo: string) {
        const response = await fetch(
          `https://api.github.com/repos/${owner}/${repo}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch repository: ${response.statusText}`);
        }

        return await response.json();
      },

      async getContents(owner: string, repo: string, path: string, ref?: string) {
        const url = new URL(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`);
        if (ref) url.searchParams.set('ref', ref);

        const response = await fetch(url.toString(), {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to get contents: ${response.statusText}`);
        }

        return await response.json();
      },
    };
  }
}

const githubApp = new GitHubApp({
  appId: process.env.GITHUB_APP_ID || '',
  privateKey: process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n') || '',
  webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || '',
});

export default githubApp;
export { GitHubApp };
