"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function OAuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [mode, setMode] = useState<'popup' | 'redirect'>('redirect');

  useEffect(() => {
    // Detect if opened in popup (has window.opener)
    const isPopup = window.opener && !window.opener.closed;
    setMode(isPopup ? 'popup' : 'redirect');

    // Get token and user from URL query parameters
    const token = searchParams.get("token");
    const userJson = searchParams.get("user");
    const error = searchParams.get("error");

    if (error) {
      if (isPopup && window.opener) {
        // Send error to parent window
        window.opener.postMessage({
          type: 'OAUTH_ERROR',
          error: error
        }, window.location.origin);
        window.close();
      } else {
        router.push(`/?error=${error}`);
      }
      return;
    }

    if (token && userJson) {
      try {
        // Parse user data from JSON string
        const user = JSON.parse(userJson);

        if (isPopup && window.opener) {
          // Popup mode: Send data to parent window
          console.log("[OAuth Callback] Popup mode - sending data to parent");
          window.opener.postMessage({
            type: 'OAUTH_SUCCESS',
            payload: { token, user }
          }, window.location.origin);

          // Close popup after short delay
          setTimeout(() => window.close(), 500);
        } else {
          // Redirect mode: Save and redirect to dashboard
          console.log("[OAuth Callback] Redirect mode - saving and redirecting");
          login(token, user);
          router.push("/dashboard");
        }
      } catch (error) {
        console.error("[OAuth Callback] Error parsing user data:", error);
        if (isPopup && window.opener) {
          window.opener.postMessage({
            type: 'OAUTH_ERROR',
            error: 'Invalid callback data'
          }, window.location.origin);
          window.close();
        } else {
          router.push("/?error=invalid_callback");
        }
      }
    } else {
      console.error("[OAuth Callback] Missing token or user data");
      if (isPopup && window.opener) {
        window.opener.postMessage({
          type: 'OAUTH_ERROR',
          error: 'Missing authentication data'
        }, window.location.origin);
        window.close();
      } else {
        router.push("/?error=missing_params");
      }
    }
  }, [searchParams, login, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <h2 className="text-xl font-semibold text-gray-900">Processing login...</h2>
        <p className="text-gray-600 mt-2">Please wait while we complete your authentication</p>
      </div>
    </div>
  );
}
