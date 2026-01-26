// Client-side session state management
const SESSION_KEY = 'wtw_session';
const PARTICIPANT_KEY = 'wtw_participant';

export interface LocalSession {
  sessionId: string;
  sessionCode: string;
  participantId: string;
  isHost: boolean;
}

export const saveLocalSession = (session: LocalSession) => {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

export const getLocalSession = (): LocalSession | null => {
  const data = sessionStorage.getItem(SESSION_KEY);
  return data ? JSON.parse(data) : null;
};

export const clearLocalSession = () => {
  sessionStorage.removeItem(SESSION_KEY);
};

export const generateSessionCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};
