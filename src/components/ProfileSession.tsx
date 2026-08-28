import { createContext, useContext, type ReactNode } from 'react';
import { clearActiveProfile, type Profile } from '../lib/profiles';

interface ProfileSessionValue {
  profile: Profile;
  lock: () => void;
}

const ProfileSessionContext = createContext<ProfileSessionValue | null>(null);

export function ProfileSession({ profile, children }: { profile: Profile; children: ReactNode }) {
  const lock = () => {
    clearActiveProfile();
    window.location.hash = '#/';
    window.location.reload();
  };
  return <ProfileSessionContext.Provider value={{profile, lock}}>{children}</ProfileSessionContext.Provider>;
}

export function useProfileSession() {
  const value = useContext(ProfileSessionContext);
  if (!value) throw new Error('Profile session is unavailable.');
  return value;
}
