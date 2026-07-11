import { invoke } from '@tauri-apps/api/core'
import type { CheckItem, LocalLicenseStatus, PersonalTenantInfo, StationConfig } from './types'

export async function loadTenant(): Promise<PersonalTenantInfo> {
  return invoke<PersonalTenantInfo>('station_get_tenant')
}

export async function loadConfig(): Promise<StationConfig> {
  return invoke<StationConfig>('station_load_config')
}

export async function saveConfig(config: StationConfig): Promise<void> {
  await invoke('station_save_config', { config })
}

export async function runDiagnostics(): Promise<CheckItem[]> {
  return invoke<CheckItem[]>('station_run_diagnostics')
}

export async function readAgentLogs(): Promise<string> {
  return invoke<string>('station_read_agent_logs')
}

export async function clearAgentLogs(): Promise<void> {
  await invoke('station_clear_agent_logs')
}

export async function agentIsRunning(): Promise<boolean> {
  return invoke<boolean>('station_agent_is_running')
}

export async function startAgent(): Promise<void> {
  await invoke('station_start_agent')
}

export async function stopAgent(): Promise<void> {
  await invoke('station_stop_agent')
}

export async function scanNina(): Promise<StationConfig> {
  return invoke<StationConfig>('station_scan_nina')
}

export async function installPython(): Promise<void> {
  await invoke('station_install_python')
}

export async function installNinaPlugin(forceUpdate = false): Promise<string> {
  return invoke<string>('station_install_nina_plugin', { forceUpdate })
}

export async function setupAutostart(): Promise<StationConfig> {
  return invoke<StationConfig>('station_setup_autostart')
}

export async function applyUpdate(): Promise<void> {
  await invoke('station_apply_update')
}

export async function hasUserLicense(): Promise<boolean> {
  return invoke<boolean>('station_has_user_license')
}

export type { LocalLicenseStatus } from './types'

export async function getLocalLicenseStatus(): Promise<LocalLicenseStatus> {
  return invoke<LocalLicenseStatus>('station_local_license_status')
}

export async function activateAccount(input: {
  apiBaseUrl: string
  login: string
  password: string
}): Promise<PersonalTenantInfo> {
  return invoke<PersonalTenantInfo>('station_activate_account', {
    apiBaseUrl: input.apiBaseUrl,
    login: input.login,
    password: input.password,
  })
}
