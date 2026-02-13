import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";

const authUrl = import.meta.env.VITE_NEON_AUTH_URL;

export const isNeonAuthConfigured = Boolean(authUrl);

type NeonAuthClient = ReturnType<typeof createAuthClient> & {
  useSession?: () => {
    data: {
      user?: {
        id?: string | null;
        email?: string | null;
        name?: string | null;
      };
    } | null;
    isPending: boolean;
    error?: unknown;
  };
  signIn?: {
    social?: (args: { provider: "google"; redirectTo?: string }) => Promise<void>;
  };
  signOut?: () => Promise<void>;
  getJWTToken?: () => Promise<string>;
};

export const neonAuth: NeonAuthClient | null = isNeonAuthConfigured
  ? (createAuthClient(authUrl, { adapter: BetterAuthReactAdapter() }) as NeonAuthClient)
  : null;

export const useNeonSession: () => {
  data: {
    user?: {
      id?: string | null;
      email?: string | null;
      name?: string | null;
    };
  } | null;
  isPending: boolean;
  error?: unknown;
} = neonAuth?.useSession ?? (() => ({ data: null, isPending: false, error: null }));

export async function getNeonJwtToken() {
  if (!neonAuth?.getJWTToken) {
    return null;
  }
  try {
    return await neonAuth.getJWTToken();
  } catch {
    return null;
  }
}

export async function signInWithGoogle(redirectTo?: string) {
  if (!neonAuth?.signIn?.social) {
    return false;
  }
  try {
    await neonAuth.signIn.social({ provider: "google", redirectTo });
    return true;
  } catch {
    return false;
  }
}

export async function neonSignOut() {
  try {
    await neonAuth?.signOut?.();
  } catch {
    // Ignore sign-out errors.
  }
}
