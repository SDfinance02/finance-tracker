import { invoke } from '@tauri-apps/api/core';
import { authenticate, checkStatus } from '@choochmeque/tauri-plugin-biometry-api';

export type ProfileKind = 'personal' | 'partner' | 'demo';

export interface Profile {
  id: string;
  name: string;
  kind: ProfileKind;
  dbFilename: string;
  hasPassword: boolean;
  biometricEnabled: boolean;
  createdAt: string;
}

export interface BiometryStatus {
  isAvailable: boolean;
  type: 'Touch ID' | 'Biometry' | 'Unavailable';
  error?: string;
}

const ACTIVE_KEY = 'finance-active-profile';
let activeProfile: Profile | null = null;

export async function listProfiles(): Promise<Profile[]> {
  return invoke<Profile[]>('list_profiles');
}

export async function createPartnerProfile(name: string, password: string, biometricEnabled: boolean): Promise<Profile> {
  return invoke<Profile>('create_profile', { name, kind: 'partner', password, biometricEnabled });
}

export async function setProfileSecurity(profileId: string, password: string, biometricEnabled: boolean): Promise<Profile> {
  return invoke<Profile>('set_profile_security', { profileId, password, biometricEnabled });
}

export async function changeProfilePassword(profileId: string, currentPassword: string, newPassword: string): Promise<void> {
  await invoke('change_profile_password', { profileId, currentPassword, newPassword });
}

export async function setBiometricEnabled(profileId: string, enabled: boolean): Promise<Profile> {
  return invoke<Profile>('set_profile_biometric', { profileId, enabled });
}

export async function verifyProfilePassword(profileId: string, password: string): Promise<boolean> {
  return invoke<boolean>('verify_profile_password', { profileId, password });
}

export async function removePartnerProfile(profileId: string, password: string): Promise<void> {
  await invoke('delete_profile', { profileId, password });
}

export async function resetDemoProfile(): Promise<void> {
  await invoke('reset_demo_profile');
}

export async function getBiometryStatus(): Promise<BiometryStatus> {
  try {
    const status = await checkStatus();
    const type = status.biometryType === 1 ? 'Touch ID' : status.isAvailable ? 'Biometry' : 'Unavailable';
    return { isAvailable: status.isAvailable, type, error: status.error };
  } catch (error) {
    return { isAvailable: false, type: 'Unavailable', error: String(error) };
  }
}

export async function authenticateBiometry(reason: string): Promise<boolean> {
  try {
    await authenticate(reason, {
      allowDeviceCredential: false,
      cancelTitle: 'Cancel',
      fallbackTitle: 'Use password',
      confirmationRequired: false,
    });
    return true;
  } catch {
    return false;
  }
}

export async function unlockWithBiometry(profile: Profile): Promise<boolean> {
  if (!profile.biometricEnabled) return false;
  try {
    await authenticate(`Unlock ${profile.name} in Finance Tracker`, {
      allowDeviceCredential: false,
      cancelTitle: 'Cancel',
      fallbackTitle: 'Use password',
      confirmationRequired: false,
    });
    return true;
  } catch {
    return false;
  }
}

export function activateProfile(profile: Profile) {
  activeProfile = profile;
  sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(profile));
}

export function getActiveProfile(): Profile | null {
  if (activeProfile) return activeProfile;
  const raw = sessionStorage.getItem(ACTIVE_KEY);
  if (!raw) return null;
  try {
    activeProfile = JSON.parse(raw) as Profile;
    return activeProfile;
  } catch {
    sessionStorage.removeItem(ACTIVE_KEY);
    return null;
  }
}

export function clearActiveProfile() {
  activeProfile = null;
  sessionStorage.removeItem(ACTIVE_KEY);
}

export function profileAccent(profile: Profile) {
  if (profile.kind === 'demo') return 'demo';
  if (profile.kind === 'partner') return 'partner';
  return 'personal';
}
