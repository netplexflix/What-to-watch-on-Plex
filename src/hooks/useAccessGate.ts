// File: src/hooks/useAccessGate.ts
import { useCallback, useEffect, useState } from 'react';
import { adminApi, plexApi } from '@/lib/api';
import { getUserIdentity } from '@/lib/userStore';

export interface AccessGateState {
  // True if the admin has enabled "Require Plex Server Access".
  gated: boolean;
  // Still fetching settings / validating token.
  verifying: boolean;
  // If gated, whether the currently stored Plex token is verified as a server member.
  // When not gated, always true.
  hasAccess: boolean;
  // Re-run the gate check (e.g. after a fresh Plex login).
  refresh: () => Promise<void>;
}

export function useAccessGate(): AccessGateState {
  const [gated, setGated] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [verifying, setVerifying] = useState(true);

  const check = useCallback(async () => {
    setVerifying(true);
    try {
      const { data } = await adminApi.getSessionSettings();
      const isGated = !!data?.settings?.require_plex_member;
      setGated(isGated);

      if (!isGated) {
        setHasAccess(true);
        return;
      }

      const identity = getUserIdentity();
      const token = identity?.type === 'plex' ? identity.plexToken : undefined;
      if (!token) {
        setHasAccess(false);
        return;
      }

      const { data: verifyData } = await plexApi.verifyAccess(token);
      setHasAccess(!!verifyData?.hasAccess);
    } catch (err) {
      console.error('[useAccessGate] verification failed:', err);
      setHasAccess(false);
    } finally {
      setVerifying(false);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  return { gated, verifying, hasAccess, refresh: check };
}
