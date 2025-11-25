"use client";

import { useState } from "react";
import { X, Github, Loader2, AlertCircle, CheckCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openOAuthPopup } from "@/lib/oauth-popup";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'login' | 'install' | 'complete';

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [step, setStep] = useState<Step>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useAuth();
  const router = useRouter();

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
  const githubAppName = '100xSWE';

  const handleGitHubLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      const oauthUrl = `${backendUrl}/auth/github/login`;
      const result = await openOAuthPopup(oauthUrl);

      // Save authentication
      login(result.token, result.user);

      console.log('[AuthModal] Login successful:', result.user.username);

      // Check if user already has installations
      try {
        const installationsResponse = await fetch(`${backendUrl}/installation/list`);
        const installationsData = await installationsResponse.json();

        if (installationsData.installations && installationsData.installations.length > 0) {
          // User already has installations, redirect to dashboard
          console.log('[AuthModal] User already has installations, redirecting to dashboard');
          router.push('/dashboard');
          onClose();
        } else {
          // No installations, show installation step
          console.log('[AuthModal] No installations found, showing install step');
          setStep('install');
        }
      } catch (err) {
        console.error('[AuthModal] Error checking installations:', err);
        // If we can't check installations, show install step to be safe
        setStep('install');
      }
    } catch (err: any) {
      console.error('[AuthModal] OAuth error:', err);
      setError(err.message || 'Failed to authenticate with GitHub');
    } finally {
      setLoading(false);
    }
  };

  const handleInstallApp = () => {
    // Redirect to GitHub App installation page
    // After installation, GitHub will redirect back to our callback URL
    const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000';
    const redirectUri = `${frontendUrl}/installation/callback`;
    const installUrl = `https://github.com/apps/${githubAppName}/installations/new?state=install`;

    console.log('[AuthModal] Redirecting to GitHub App installation:', installUrl);

    // Full page redirect (GitHub App installation can't happen in popup/iframe)
    window.location.href = installUrl;
  };

  const handleSkipInstall = () => {
    // Go directly to dashboard without app installation
    router.push('/dashboard');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">
            {step === 'login' && 'Connect with GitHub'}
            {step === 'install' && 'Install GitHub App'}
            {step === 'complete' && 'Setup Complete!'}
          </h2>
          <button
            onClick={onClose}
            className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-1 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Step 1: Login */}
          {step === 'login' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Github className="w-8 h-8 text-gray-700" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Sign in with GitHub
                </h3>
                <p className="text-sm text-gray-600">
                  Authenticate with your GitHub account to access your repositories
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <Button
                onClick={handleGitHubLogin}
                disabled={loading}
                className="w-full bg-gray-900 hover:bg-gray-800 text-white font-semibold py-3"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Github className="w-5 h-5 mr-2" />
                    Continue with GitHub
                  </>
                )}
              </Button>

              <p className="text-xs text-gray-500 text-center">
                By continuing, you agree to authorize access to your GitHub account
              </p>
            </div>
          )}

          {/* Step 2: Install App */}
          {step === 'install' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Authentication Successful!
                </h3>
                <p className="text-sm text-gray-600">
                  Now install the GitHub App to enable automatic indexing
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2 text-sm">
                  Why install the GitHub App?
                </h4>
                <ul className="text-xs text-blue-800 space-y-1.5 list-disc list-inside">
                  <li>Automatic repository indexing on every push</li>
                  <li>Real-time webhook notifications for code changes</li>
                  <li>Incremental indexing for faster updates</li>
                  <li>No manual intervention required</li>
                </ul>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <div className="space-y-3">
                <Button
                  onClick={handleInstallApp}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3"
                >
                  <ExternalLink className="w-5 h-5 mr-2" />
                  Install GitHub App
                </Button>

                <Button
                  onClick={handleSkipInstall}
                  variant="outline"
                  className="w-full text-gray-600"
                >
                  Skip for Now
                </Button>
              </div>

              <p className="text-xs text-gray-500 text-center">
                You'll be redirected to GitHub to select repositories, then automatically returned to your dashboard
              </p>
            </div>
          )}

          {/* Step 3: Complete */}
          {step === 'complete' && (
            <div className="space-y-6 text-center py-6">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-12 h-12 text-green-600" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  All Set!
                </h3>
                <p className="text-sm text-gray-600">
                  Redirecting you to your dashboard...
                </p>
              </div>
              <div className="flex justify-center">
                <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
