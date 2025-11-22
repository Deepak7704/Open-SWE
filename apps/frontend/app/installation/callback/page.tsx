"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

export default function InstallationCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [status, setStatus] = useState<'checking' | 'success' | 'error'>('checking');
  const [message, setMessage] = useState('Verifying installation...');

  useEffect(() => {
    const verifyInstallation = async () => {
      try {
        const installationId = searchParams.get("installation_id");
        const setupAction = searchParams.get("setup_action");

        console.log('[Installation Callback] Installation ID:', installationId);
        console.log('[Installation Callback] Setup Action:', setupAction);

        if (!installationId) {
          throw new Error('No installation ID received');
        }

        // Wait a moment for webhook to process
        setMessage('Processing installation...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check if installation exists in database
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
        const response = await fetch(`${backendUrl}/installation/list`);
        const data = await response.json();

        console.log('[Installation Callback] Installations:', data);

        // Check if the installation exists
        const installation = data.installations?.find(
          (inst: any) => inst.installationId === parseInt(installationId)
        );

        if (installation) {
          console.log('[Installation Callback] Installation verified!', installation);
          setStatus('success');
          setMessage('Installation successful! Redirecting to dashboard...');

          // Redirect to dashboard after short delay
          setTimeout(() => {
            router.push('/dashboard');
          }, 1500);
        } else {
          // Installation might not be in DB yet, wait and retry
          console.log('[Installation Callback] Installation not found yet, retrying...');
          setMessage('Finalizing setup...');

          await new Promise(resolve => setTimeout(resolve, 3000));

          // Retry check
          const retryResponse = await fetch(`${backendUrl}/installation/list`);
          const retryData = await retryResponse.json();

          const retryInstallation = retryData.installations?.find(
            (inst: any) => inst.installationId === parseInt(installationId)
          );

          if (retryInstallation) {
            setStatus('success');
            setMessage('Installation successful! Redirecting to dashboard...');
            setTimeout(() => router.push('/dashboard'), 1500);
          } else {
            throw new Error('Installation not found. Please try again.');
          }
        }
      } catch (error: any) {
        console.error('[Installation Callback] Error:', error);
        setStatus('error');
        setMessage(error.message || 'Failed to verify installation');

        // Redirect to dashboard anyway after 3 seconds
        setTimeout(() => {
          router.push('/dashboard');
        }, 3000);
      }
    };

    verifyInstallation();
  }, [searchParams, router, user]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full mx-4">
        <div className="text-center">
          {/* Icon */}
          <div className="mb-6">
            {status === 'checking' && (
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
              </div>
            )}
            {status === 'success' && (
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
            )}
            {status === 'error' && (
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <XCircle className="w-10 h-10 text-red-600" />
              </div>
            )}
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            {status === 'checking' && 'Setting Up Your Installation'}
            {status === 'success' && 'Installation Complete!'}
            {status === 'error' && 'Setup Issue'}
          </h2>

          {/* Message */}
          <p className="text-gray-600 mb-6">
            {message}
          </p>

          {/* Progress indicator */}
          {status === 'checking' && (
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
            </div>
          )}

          {/* Additional info */}
          <p className="text-xs text-gray-500 mt-4">
            {status === 'checking' && 'This usually takes just a few seconds...'}
            {status === 'success' && 'Your repositories are now connected!'}
            {status === 'error' && "Don't worry, you can complete setup from your dashboard."}
          </p>
        </div>
      </div>
    </div>
  );
}
