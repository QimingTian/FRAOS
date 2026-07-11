use std::fs;
use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonalTenantInfo {
    pub tenant_id: String,
    pub api_base_url: String,
    pub display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TenantFile {
    tenant_id: String,
    api_base_url: String,
    api_secret: String,
    display_name: Option<String>,
    plan: Option<String>,
    #[serde(default)]
    valid_until: Option<String>,
    #[serde(default)]
    member_id: Option<String>,
    #[serde(default)]
    team_role: Option<String>,
    #[serde(default)]
    member_hub_token: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ControlVersionResponse {
    latest_version: String,
    download_url: Option<String>,
    download_url_windows: Option<String>,
    download_url_mac: Option<String>,
}

fn dirs_home() -> PathBuf {
    std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn edition_slug() -> &'static str {
    include_str!(concat!(env!("OUT_DIR"), "/edition_slug.txt")).trim()
}

fn borean_root_dir() -> PathBuf {
    if cfg!(target_os = "windows") {
        let base = std::env::var("LOCALAPPDATA")
            .unwrap_or_else(|_| PathBuf::from(".").to_string_lossy().into_owned());
        PathBuf::from(base).join("BoreanAstro")
    } else {
        dirs_home().join(".boreanastro")
    }
}

fn borean_data_dir() -> PathBuf {
    borean_root_dir().join(edition_slug())
}

fn legacy_user_tenant_path() -> PathBuf {
    borean_root_dir().join("tenant.json")
}

fn user_tenant_path() -> PathBuf {
    borean_data_dir().join("tenant.json")
}

fn baked_tenant_raw() -> Result<TenantFile, String> {
    serde_json::from_str(include_str!(concat!(env!("OUT_DIR"), "/tenant_config.json")))
        .map_err(|e| format!("Invalid baked tenant config: {e}"))
}

fn read_user_tenant_raw() -> Option<TenantFile> {
    let path = user_tenant_path();
    if path.exists() {
        let raw = fs::read_to_string(path).ok()?;
        return serde_json::from_str(&raw).ok();
    }
    None
}

fn resolve_tenant_raw() -> Result<TenantFile, String> {
    if let Some(user) = read_user_tenant_raw() {
        return Ok(user);
    }
    baked_tenant_raw()
}

fn tenant_info_from(raw: &TenantFile) -> PersonalTenantInfo {
    PersonalTenantInfo {
        tenant_id: raw.tenant_id.trim().to_string(),
        api_base_url: raw.api_base_url.trim().trim_end_matches('/').to_string(),
        display_name: raw
            .display_name
            .as_ref()
            .filter(|s| !s.trim().is_empty())
            .cloned()
            .unwrap_or_else(|| raw.tenant_id.clone()),
        plan: raw
            .plan
            .as_ref()
            .filter(|s| !s.trim().is_empty())
            .cloned(),
    }
}

fn control_version_url(raw: &TenantFile) -> String {
    format!(
        "{}/api/personal/{}/control/version",
        raw.api_base_url.trim().trim_end_matches('/'),
        raw.tenant_id.trim()
    )
}

fn fetch_control_version_manifest() -> Result<ControlVersionResponse, String> {
    let raw = resolve_tenant_raw()?;
    let url = control_version_url(&raw);
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(4))
        .build();
    let response = agent.get(&url).call().map_err(|e| e.to_string())?;
    if response.status() >= 400 {
        return Err(format!("HTTP {}", response.status()));
    }
    response
        .into_string()
        .map_err(|e| e.to_string())
        .and_then(|body| serde_json::from_str(&body).map_err(|e| e.to_string()))
}

/// Override with env `FRAOS_ASTROMETRY_SOLVE_URL` (your deployed `/api/astrometry/solve`).
fn plate_solve_api() -> String {
    std::env::var("FRAOS_ASTROMETRY_SOLVE_URL").unwrap_or_else(|_| {
        "https://YOUR_DOMAIN/api/astrometry/solve".to_string()
    })
}

fn plate_solve_agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(120))
        .build()
}

fn mime_for_filename(name: &str) -> &'static str {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".png") {
        return "image/png";
    }
    if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        return "image/jpeg";
    }
    if lower.ends_with(".fits") || lower.ends_with(".fit") {
        return "application/fits";
    }
    "application/octet-stream"
}

fn multipart_file_body(file_bytes: &[u8], file_name: &str, mime: &str) -> (String, Vec<u8>) {
    let boundary = format!(
        "----BoreanBoundary{:x}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    );
    let mut body = Vec::new();
    body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    body.extend_from_slice(
        format!("Content-Disposition: form-data; name=\"file\"; filename=\"{file_name}\"\r\n").as_bytes(),
    );
    body.extend_from_slice(format!("Content-Type: {mime}\r\n\r\n").as_bytes());
    body.extend_from_slice(file_bytes);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    (boundary, body)
}

fn plate_solve_upload(file_bytes: &[u8], file_name: &str) -> Result<u64, String> {
    let name = if file_name.trim().is_empty() {
        "upload.png".to_string()
    } else {
        file_name.to_string()
    };
    let mime = mime_for_filename(&name);
    let (boundary, body) = multipart_file_body(file_bytes, &name, mime);
    let agent = plate_solve_agent();
    let response = agent
        .post(&plate_solve_api())
        .set(
            "Content-Type",
            &format!("multipart/form-data; boundary={boundary}"),
        )
        .send_bytes(&body)
        .map_err(|e| e.to_string())?;
    let status = response.status();
    let response_body = response.into_string().map_err(|e| e.to_string())?;
    if status >= 400 {
        let msg = if status == 413 {
            "Image is too large for upload (max ~4 MB). The app compresses large PNGs automatically — restart and try again.".into()
        } else {
            parse_api_error(status, &response_body)
        };
        return Err(msg);
    }
    let json: serde_json::Value =
        serde_json::from_str(&response_body).map_err(|e| format!("Invalid upload response: {e}"))?;
    json.get("subid")
        .and_then(|value| value.as_u64())
        .ok_or_else(|| {
            json.get("error")
                .and_then(|value| value.as_str())
                .unwrap_or("Upload failed.")
                .to_string()
        })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlateSolvePollResult {
    status: String,
    error: Option<String>,
    arcsec_per_pixel: Option<f64>,
    orientation_deg: Option<f64>,
    parity: Option<i32>,
}

fn plate_solve_poll(subid: u64) -> Result<PlateSolvePollResult, String> {
    let url = format!("{}?subid={subid}", plate_solve_api());
    let agent = plate_solve_agent();
    let response = agent.get(&url).call().map_err(|e| e.to_string())?;
    let response_body = response.into_string().map_err(|e| e.to_string())?;
    let json: serde_json::Value =
        serde_json::from_str(&response_body).map_err(|e| format!("Invalid poll response: {e}"))?;
    let status = json
        .get("status")
        .and_then(|value| value.as_str())
        .unwrap_or("processing")
        .to_string();
    let calibration = json.get("calibration");
    Ok(PlateSolvePollResult {
        status,
        error: json
            .get("error")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string()),
        arcsec_per_pixel: calibration
            .and_then(|value| value.get("arcsecPerPixel"))
            .and_then(|value| value.as_f64()),
        orientation_deg: calibration
            .and_then(|value| value.get("orientationDeg"))
            .and_then(|value| value.as_f64()),
        parity: calibration
            .and_then(|value| value.get("parity"))
            .and_then(|value| value.as_i64())
            .map(|value| value as i32),
    })
}

fn parse_version_parts(version: &str) -> Vec<u64> {
    version
        .trim()
        .trim_start_matches('v')
        .split('.')
        .map(|part| part.parse().unwrap_or(0))
        .collect()
}

fn compare_versions(left: &str, right: &str) -> std::cmp::Ordering {
    let left_parts = parse_version_parts(left);
    let right_parts = parse_version_parts(right);
    let len = left_parts.len().max(right_parts.len());
    for index in 0..len {
        let left_value = *left_parts.get(index).unwrap_or(&0);
        let right_value = *right_parts.get(index).unwrap_or(&0);
        match left_value.cmp(&right_value) {
            std::cmp::Ordering::Equal => {}
            other => return other,
        }
    }
    std::cmp::Ordering::Equal
}

fn pick_download_url(manifest: &ControlVersionResponse) -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        manifest
            .download_url_mac
            .as_ref()
            .or(manifest.download_url.as_ref())
            .filter(|value| !value.trim().is_empty())
            .map(|value| value.trim().to_string())
    }
    #[cfg(target_os = "windows")]
    {
        manifest
            .download_url_windows
            .as_ref()
            .or(manifest.download_url.as_ref())
            .filter(|value| !value.trim().is_empty())
            .map(|value| value.trim().to_string())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        manifest
            .download_url
            .as_ref()
            .filter(|value| !value.trim().is_empty())
            .map(|value| value.trim().to_string())
    }
}

fn open_download_url(url: &str) -> Result<(), String> {
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateStatus {
    installed_version: String,
    latest_version: String,
    update_available: bool,
    download_url: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TenantConfigPublic {
    tenant_id: String,
    api_base_url: String,
    api_secret: String,
    display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    member_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    team_role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    member_hub_token: Option<String>,
}

#[tauri::command]
fn control_get_tenant() -> Result<PersonalTenantInfo, String> {
    let raw = resolve_tenant_raw()?;
    Ok(tenant_info_from(&raw))
}

#[tauri::command]
fn control_get_tenant_config() -> Result<TenantConfigPublic, String> {
    let raw = resolve_tenant_raw()?;
    Ok(TenantConfigPublic {
        tenant_id: raw.tenant_id.trim().to_string(),
        api_base_url: raw.api_base_url.trim().trim_end_matches('/').to_string(),
        api_secret: raw.api_secret.trim().to_string(),
        display_name: raw
            .display_name
            .as_ref()
            .filter(|s| !s.trim().is_empty())
            .cloned()
            .unwrap_or_else(|| raw.tenant_id.clone()),
        member_id: raw.member_id.clone(),
        team_role: raw.team_role.clone(),
        member_hub_token: raw.member_hub_token.clone(),
    })
}

#[tauri::command]
fn control_get_license_path() -> Result<String, String> {
    Ok(user_tenant_path().to_string_lossy().into_owned())
}

fn save_tenant_config(raw: &TenantFile) -> Result<(), String> {
    if raw.tenant_id.trim().is_empty()
        || raw.api_base_url.trim().is_empty()
        || raw.api_secret.trim().is_empty()
    {
        return Err("License is missing tenantId, apiBaseUrl, or apiSecret.".into());
    }
    let dest = user_tenant_path();
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Could not create license directory: {e}"))?;
    }
    let serialized =
        serde_json::to_string_pretty(raw).map_err(|e| format!("Could not serialize license: {e}"))?;
    fs::write(&dest, serialized).map_err(|e| format!("Could not install license file: {e}"))?;
    Ok(())
}

fn parse_api_error(status: u16, body: &str) -> String {
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(body) {
        if let Some(error) = json.get("error").and_then(|value| value.as_str()) {
            return error.to_string();
        }
    }
    format!("HTTP {status}")
}

fn activate_account(api_base_url: String, login: String, password: String) -> Result<TenantFile, String> {
    let base = api_base_url.trim().trim_end_matches('/').to_string();
    if base.is_empty() {
        return Err("Cloud hub URL is required.".into());
    }
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(15))
        .build();

    let login_payload = serde_json::json!({
        "login": login.trim(),
        "password": password,
        "client": "app",
    })
    .to_string();
    let login_response = agent
        .post(&format!("{base}/api/auth/login"))
        .set("Content-Type", "application/json")
        .set("X-Borean-Client", "app")
        .send_string(&login_payload)
        .map_err(|e| e.to_string())?;

    let login_status = login_response.status();
    let login_body = login_response.into_string().map_err(|e| e.to_string())?;
    if login_status >= 400 {
        return Err(parse_api_error(login_status, &login_body));
    }

    let login_json: serde_json::Value =
        serde_json::from_str(&login_body).map_err(|e| format!("Invalid login response: {e}"))?;
    if login_json.get("ok").and_then(|value| value.as_bool()) != Some(true) {
        return Err(login_json
            .get("error")
            .and_then(|value| value.as_str())
            .unwrap_or("Sign in failed.")
            .to_string());
    }
    let token = login_json
        .get("sessionToken")
        .and_then(|value| value.as_str())
        .ok_or("Sign in succeeded but no session token was returned.")?;

    let license_response = agent
        .get(&format!("{base}/api/member/license"))
        .set("Authorization", &format!("Bearer {token}"))
        .call()
        .map_err(|e| e.to_string())?;

    let license_status = license_response.status();
    let license_body = license_response.into_string().map_err(|e| e.to_string())?;
    if license_status >= 400 {
        return Err(parse_api_error(license_status, &license_body));
    }

    let license_json: serde_json::Value =
        serde_json::from_str(&license_body).map_err(|e| format!("Invalid license response: {e}"))?;
    let tenant_value = license_json
        .get("tenantConfig")
        .ok_or("License response did not include tenantConfig.")?;
    let mut tenant: TenantFile = serde_json::from_value(tenant_value.clone())
        .map_err(|e| format!("Invalid tenant license payload: {e}"))?;

    if let Some(member_id) = license_json.get("memberId").and_then(|value| value.as_str()) {
        tenant.member_id = Some(member_id.trim().to_string());
    }
    if let Some(role) = license_json.get("teamRole").and_then(|value| value.as_str()) {
        tenant.team_role = Some(role.trim().to_string());
    }
    if let Some(token) = license_json.get("memberHubToken").and_then(|value| value.as_str()) {
        tenant.member_hub_token = Some(token.trim().to_string());
    }

    Ok(tenant)
}

fn tenant_is_expired(raw: &TenantFile) -> bool {
    let Some(until) = raw.valid_until.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) else {
        return false;
    };
    let Ok(expires_ms) = chrono::DateTime::parse_from_rfc3339(until).map(|dt| dt.timestamp_millis()) else {
        return false;
    };
    expires_ms <= chrono::Utc::now().timestamp_millis()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalLicenseStatus {
    installed: bool,
    valid: bool,
    expired: bool,
    valid_until: Option<String>,
    plan: Option<String>,
}

fn local_license_status() -> LocalLicenseStatus {
    let user_installed = read_user_tenant_raw().is_some();
    let Ok(raw) = resolve_tenant_raw() else {
        return LocalLicenseStatus {
            installed: false,
            valid: false,
            expired: false,
            valid_until: None,
            plan: None,
        };
    };
    let expired = tenant_is_expired(&raw);
    LocalLicenseStatus {
        installed: user_installed,
        valid: user_installed && !expired,
        expired: user_installed && expired,
        valid_until: raw.valid_until.clone(),
        plan: raw.plan.clone(),
    }
}

#[tauri::command]
fn control_local_license_status() -> Result<LocalLicenseStatus, String> {
    Ok(local_license_status())
}

#[tauri::command]
fn control_has_user_license() -> Result<bool, String> {
    Ok(local_license_status().valid)
}

#[tauri::command]
fn control_activate_account(
    api_base_url: String,
    login: String,
    password: String,
) -> Result<PersonalTenantInfo, String> {
    let raw = activate_account(api_base_url, login, password)?;
    save_tenant_config(&raw)?;
    Ok(tenant_info_from(&raw))
}

#[tauri::command]
fn control_import_tenant(source_path: String) -> Result<PersonalTenantInfo, String> {
    let source = PathBuf::from(source_path.trim());
    if !source.exists() {
        return Err("Selected file does not exist.".into());
    }
    let raw: TenantFile = serde_json::from_str(
        &fs::read_to_string(&source).map_err(|e| format!("Could not read license file: {e}"))?,
    )
    .map_err(|e| format!("Invalid tenant.json: {e}"))?;
    save_tenant_config(&raw)?;
    Ok(tenant_info_from(&raw))
}

#[tauri::command]
fn control_app_version() -> Result<String, String> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}

#[tauri::command]
async fn control_check_update() -> Result<UpdateStatus, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let installed = env!("CARGO_PKG_VERSION");
        let manifest = fetch_control_version_manifest()?;
        let latest = manifest.latest_version.trim().to_string();
        Ok(UpdateStatus {
            installed_version: installed.to_string(),
            latest_version: latest.clone(),
            update_available: compare_versions(installed, &latest) == std::cmp::Ordering::Less,
            download_url: pick_download_url(&manifest),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn control_apply_update() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        let installed = env!("CARGO_PKG_VERSION");
        let manifest = fetch_control_version_manifest()?;
        let latest = manifest.latest_version.trim();
        if compare_versions(installed, latest) != std::cmp::Ordering::Less {
            return Err("Control Client is already up to date.".into());
        }
        let url = pick_download_url(&manifest)
            .ok_or_else(|| format!("Update v{latest} is available but download URL is not configured yet."))?;
        open_download_url(&url)?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn control_plate_solve_upload(file_bytes: Vec<u8>, file_name: String) -> Result<u64, String> {
    tauri::async_runtime::spawn_blocking(move || plate_solve_upload(&file_bytes, &file_name))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn control_plate_solve_poll(subid: u64) -> Result<PlateSolvePollResult, String> {
    tauri::async_runtime::spawn_blocking(move || plate_solve_poll(subid))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            control_get_tenant,
            control_get_tenant_config,
            control_get_license_path,
            control_local_license_status,
            control_has_user_license,
            control_activate_account,
            control_import_tenant,
            control_app_version,
            control_check_update,
            control_apply_update,
            control_plate_solve_upload,
            control_plate_solve_poll,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
