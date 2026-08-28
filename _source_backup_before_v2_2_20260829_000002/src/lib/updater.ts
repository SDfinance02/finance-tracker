import { invoke } from '@tauri-apps/api/core';

export interface UpdateStatus {
  configured: boolean;
  currentVersion: string;
  available: boolean;
  version?: string | null;
  notes?: string | null;
  endpoint?: string | null;
  error?: string | null;
}

export interface StorageInfo {
  appConfigDir: string;
  databasePath: string;
  databaseExists: boolean;
  backupsDir: string;
  documentsDir: string;
  cacheDir: string;
  appVersion: string;
}

export async function checkForUpdate(): Promise<UpdateStatus> {
  return invoke<UpdateStatus>('check_for_update');
}

export async function installAvailableUpdate(): Promise<void> {
  await invoke('install_available_update');
}

export async function getStorageInfo(): Promise<StorageInfo> {
  return invoke<StorageInfo>('storage_info');
}

export async function saveUpdaterConfig(endpoint: string, pubkey: string): Promise<void> {
  await invoke('save_updater_config', { endpoint, pubkey });
}
