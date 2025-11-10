"use client";
import { useEffect,useState } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";

export default function LoginPage(){
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isLoading,setIsLoading] = useState(false);
    const [error,setError] = useState<string | null >(null);

    //check if user is alread logged in 
    useEffect(()=>{
        const storedUser = localStorage.getItem("gihub_user");
        if(storedUser){
            //user is already logged in so redirect them to dashboard
            router.push('/dashboard');//sends the user to dashboard route
        }
        //check for errors from OAuth callback
        const errrorParam  = searchParams.get('error');
        if(errrorParam){
            setError(decodeURIComponent(errrorParam));
        }
    },[router,searchParams]);

    // handle "connect with github account"
    const handleGithubLogin = ()=>{
        setIsLoading(true);
        setError(null);
        //redirect to backend OAuth endpoint
        // then backend will redirect to github
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
        window.location.href = `${backendUrl}/auth/github/login`;
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-xl shadow-lg">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              OpenSWE
            </h1>
            <p className="text-gray-600">
              AI-powered code generation and analysis
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* GitHub Connect Button */}
          <div className="space-y-4">
            <button
              onClick={handleGithubLogin}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 bg-gray-900 hover:bg-gray-800 text-white font-semibold py-3 px-4 rounded-lg
  transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {/* GitHub Icon SVG */}
              <svg
                className="w-5 h-5"
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fillRule="evenodd"
                  d="M10 0C4.477 0 0 4.477 0 10c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482
  0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531
  1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984
  1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0110 4.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025
  2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012
  2.415-.012 2.743 0 .267.18.578.688.48C17.138 18.163 20 14.418 20 10c0-5.523-4.477-10-10-10z"
                  clipRule="evenodd"
                />
              </svg>

              {isLoading ? 'Connecting...' : 'Continue with GitHub'}
            </button>

            {/* Info text */}
            <p className="text-sm text-gray-500 text-center">
              We'll ask for permission to access your repositories.
              You can revoke access anytime from GitHub settings.
            </p>
          </div>

          {/* Features list */}
          <div className="pt-6 border-t border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              What you can do:
            </h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>AI-powered code generation and analysis</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Automatic code indexing on every push</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Smart code search across repositories</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    );
}