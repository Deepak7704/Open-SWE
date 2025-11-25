"use client";
import { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import { User } from '@/types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount, check if user is already logged in (from localStorage)
  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('github_user');

    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch (err) {
        console.error('Failed to parse stored user:', err);
        // Clear invalid data
        localStorage.removeItem('auth_token');
        localStorage.removeItem('github_user');
      }
    }
    setIsLoading(false);
  }, []);

  // Login function - called after OAuth callback
  // Memoized to prevent unnecessary re-renders
  const login = useCallback((newToken: string, newUser: User) => {
    localStorage.setItem('auth_token', newToken);
    localStorage.setItem('github_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []); // No dependencies - function logic never changes

  // Logout function - clears session and redirects
  // Memoized to prevent unnecessary re-renders
  const logout = useCallback(async () => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

    // Call backend logout to delete Redis session
    try {
      await fetch(`${backendUrl}/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
    } catch (err) {
      console.error('Logout error:', err);
    }

    // Clear local storage
    localStorage.removeItem('auth_token');
    localStorage.removeItem('github_user');
    setToken(null);
    setUser(null);

    // Redirect to home page
    window.location.href = '/';
  }, [token]); // Only depends on token

  // Memoize the context value to prevent unnecessary re-renders
  // Only creates a new object when dependencies actually change
  const value = useMemo(() => {
    console.log('[AuthContext] Creating new context value');
    console.log('[AuthContext] User:', user?.username || 'null');
    console.log('[AuthContext] Token exists:', !!token);
    console.log('[AuthContext] isLoading:', isLoading);

    return {
      user,
      token,
      isLoading,
      login,
      logout,
      isAuthenticated: !!user && !!token,
    };
  }, [user, token, isLoading, login, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
