import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { clearAuthToken, getAuthToken, setAuthToken } from "./authToken";

type UserInfo = {
  sub: string;
  email?: string;
  name?: string;
};

type AuthContextValue = {
  user: UserInfo | null;
  token: string | null;
  initializing: boolean;
  loginButton: React.ReactNode;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function decodeToken(token: string): UserInfo | null {
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(atob(payload));
    return {
      sub: decoded.sub,
      email: decoded.email,
      name: decoded.name || decoded.email,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const stored = getAuthToken();
    if (stored) {
      const info = decodeToken(stored);
      if (info) {
        setToken(stored);
        setUser(info);
      } else {
        clearAuthToken();
      }
    }
    setInitializing(false);
  }, []);

  const handleSuccess = (credential?: string | undefined) => {
    if (!credential) return;
    const info = decodeToken(credential);
    if (info) {
      setAuthToken(credential);
      setToken(credential);
      setUser(info);
    }
  };

  const logout = () => {
    clearAuthToken();
    setToken(null);
    setUser(null);
  };

  const loginButton = (
    <GoogleLogin
      onSuccess={(response) => handleSuccess(response.credential)}
      onError={() => logout()}
      containerProps={{ style: { padding: 0, margin: 0 } }}
      text="signin_with"
      shape="rectangular"
      useOneTap
    />
  );

  const value = useMemo(
    () => ({
      user,
      token,
      initializing,
      loginButton,
      logout,
    }),
    [initializing, loginButton, logout, token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export function AuthWrapper({ children }: { children: React.ReactNode }) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    return (
      <div style={{ maxWidth: 520, margin: "2rem auto", padding: "1rem" }}>
        <p style={{ fontWeight: 600 }}>Google OAuth not configured</p>
        <p>
          Set <code>VITE_GOOGLE_CLIENT_ID</code> (e.g. in <code>.env.local</code>) to enable
          sign-in. For local dev, register http://localhost:5173 as an authorized origin in
          your Google OAuth client.
        </p>
      </div>
    );
  }
  return (
    <GoogleOAuthProvider clientId={clientId}>
      <AuthProvider>{children}</AuthProvider>
    </GoogleOAuthProvider>
  );
}
