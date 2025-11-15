"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function OAuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  useEffect(() => {
    // Get token and user from URL query parameters
    const token = searchParams.get("token");
    const userJson = searchParams.get("user");

    if (token && userJson) {
      try {
        // Parse user data from JSON string
        const user = JSON.parse(userJson);

        // Save to localStorage via AuthContext
        login(token, user);

        console.log("[OAuth Callback] User logged in:", user.username);

        // Redirect to dashboard
        router.push("/dashboard");
      } catch (error) {
        console.error("[OAuth Callback] Error parsing user data:", error);
        router.push("/login?error=invalid_callback");
      }
    } else {
      console.error("[OAuth Callback] Missing token or user data");
      router.push("/login?error=missing_params");
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
