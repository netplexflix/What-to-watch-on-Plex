// File: src/hooks/useCreateGate.ts
import { useCallback, useEffect, useState } from 'react';
import { adminApi, plexApi } from '@/lib/api';
import { getUserIdentity } from '@/lib/userStore';

const CREATE_PASSWORD_KEY = 'wtw_create_password';

// The verified password is kept for the hop from the landing page to /create,
// and cleared once the session has been created.
export const saveCreatePassword = (password: string) => {
  try {
    sessionStorage.setItem(CREATE_PASSWORD_KEY, password);
  } catch {
    /* ignore */
  }
};

export const getCreatePassword = (): string | null => {
  try {
    return sessionStorage.getItem(CREATE_PASSWORD_KEY);
  } catch {
    return null;
  }
};

export const clearCreatePassword = () => {
  try {
    sessionStorage.removeItem(CREATE_PASSWORD_KEY);
  } catch {
    /* ignore */
  }
};

export interface CreateGateState {
  // True if the admin restricted creation to verified Plex server members.
  requirePlex: boolean;
  // True if the admin set a password on session creation.
  requirePassword: boolean;
  // When requirePlex, whether the stored Plex token is verified as a server member.
  // When not required, always true.
  plexOk: boolean;
  // Still fetching settings / validating token.
  verifying: boolean;
  // Re-run the gate check (e.g. after a fresh Plex login).
  refresh: () => Promise<void>;
}

export function useCreateGate(): CreateGateState {
  const [requirePlex, setRequirePlex] = useState(false);
  const [requirePassword, setRequirePassword] = useState(false);
  const [plexOk, setPlexOk] = useState(false);
  const [verifying, setVerifying] = useState(true);

  const check = useCallback(async () => {
    setVerifying(true);
    try {
      const { data } = await adminApi.getSessionSettings();
      const needsPlex = !!data?.settings?.restrict_create_plex;
      setRequirePlex(needsPlex);
      setRequirePassword(!!data?.settings?.restrict_create_password);

      if (!needsPlex) {
        setPlexOk(true);
        return;
      }

      const identity = getUserIdentity();
      const token = identity?.type === 'plex' ? identity.plexToken : undefined;
      if (!token) {
        setPlexOk(false);
        return;
      }

      const { data: verifyData } = await plexApi.verifyAccess(token);
      setPlexOk(!!verifyData?.hasAccess);
    } catch (err) {
      console.error('[useCreateGate] verification failed:', err);
      setPlexOk(false);
    } finally {
      setVerifying(false);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  return { requirePlex, requirePassword, plexOk, verifying, refresh: check };
}
