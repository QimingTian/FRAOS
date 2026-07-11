//! Windows-only platform helpers (Station ships on Windows only — NINA has no Mac build).

use std::fs;
use std::io::Write;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;

const CREATE_NO_WINDOW: u32 = 0x08000000;
const AUTOSTART_REG_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
const AUTOSTART_VALUE: &str = "BoreanAstroStation";

fn hidden_cmd(program: &str) -> Command {
    let mut cmd = Command::new(program);
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

fn nina_install_dir_from_exe(exe: &Path) -> Option<PathBuf> {
    exe.parent().map(|p| p.to_path_buf())
}

fn find_nina_exe_in_dir(dir: &Path, depth: u32) -> Option<PathBuf> {
    if depth == 0 {
        return None;
    }
    let direct = dir.join("NINA.exe");
    if direct.is_file() {
        return nina_install_dir_from_exe(&direct);
    }
    let entries = fs_read_dir(dir).ok()?;
    for entry in entries {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_nina_exe_in_dir(&path, depth - 1) {
                return Some(found);
            }
        }
    }
    None
}

fn fs_read_dir(dir: &Path) -> Result<Vec<std::fs::DirEntry>, String> {
    std::fs::read_dir(dir)
        .map_err(|e| format!("Cannot read {}: {e}", dir.display()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn scan_nina_install_dir() -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(pf) = std::env::var("ProgramFiles") {
        candidates.push(PathBuf::from(pf));
    }
    if let Ok(pf86) = std::env::var("ProgramFiles(x86)") {
        candidates.push(PathBuf::from(pf86));
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        candidates.push(PathBuf::from(local).join("Programs"));
    }

    for letter in b'C'..=b'Z' {
        let root = format!("{}:\\", letter as char);
        if !Path::new(&root).exists() {
            continue;
        }
        for sub in ["Program Files", "Program Files (x86)"] {
            let dir = PathBuf::from(&root).join(sub);
            if dir.is_dir() && !candidates.iter().any(|c| c == &dir) {
                candidates.push(dir);
            }
        }
    }

    for dir in candidates {
        if let Some(install_dir) = find_nina_exe_in_dir(&dir, 5) {
            return Ok(install_dir);
        }
    }

    if let Ok(profile) = std::env::var("USERPROFILE") {
        let users_programs = PathBuf::from(profile).join("AppData").join("Local").join("Programs");
        if let Some(install_dir) = find_nina_exe_in_dir(&users_programs, 4) {
            return Ok(install_dir);
        }
    }

    Err("NINA.exe not found on this PC. Install NINA or set the directory manually in Settings.".into())
}

pub fn python_available() -> bool {
    for cmd in ["py", "python", "python3"] {
        let mut command = hidden_cmd(cmd);
        if cmd == "py" {
            command.args(["-3", "--version"]);
        } else {
            command.arg("--version");
        }
        if command.output().map(|o| o.status.success()).unwrap_or(false) {
            return true;
        }
    }
    false
}

pub fn install_python() -> Result<(), String> {
    if python_available() {
        return Ok(());
    }

    append_install_log("Installing Python 3.12 via winget…");
    let mut winget = hidden_cmd("winget");
    winget.args([
        "install",
        "-e",
        "--id",
        "Python.Python.3.12",
        "--accept-package-agreements",
        "--accept-source-agreements",
        "--silent",
    ]);
    let output = winget
        .output()
        .map_err(|e| format!("Could not run winget: {e}. Install Python 3.12 from python.org."))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    append_install_log(&format!("winget stdout: {stdout}"));
    if !stderr.trim().is_empty() {
        append_install_log(&format!("winget stderr: {stderr}"));
    }

    if !output.status.success() && !python_available() {
        return Err(
            "Automatic Python install failed. Install Python 3.12 from https://www.python.org/downloads/windows/ and enable the py launcher."
                .into(),
        );
    }

    if !python_available() {
        std::thread::sleep(std::time::Duration::from_secs(3));
    }
    if !python_available() {
        return Err("Python install finished but py/python is still not available. Restart Station or log out and back in.".into());
    }
    Ok(())
}

fn append_install_log(line: &str) {
    if let Ok(base) = std::env::var("LOCALAPPDATA") {
        let log = PathBuf::from(base)
            .join("BoreanAstro")
            .join("Station")
            .join("agent.log");
        let _ = std::fs::create_dir_all(log.parent().unwrap_or(Path::new(".")));
        use std::io::Write;
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(log)
        {
            let _ = writeln!(f, "[station-ui] {line}");
        }
    }
}

pub fn autostart_is_active() -> bool {
    let mut command = hidden_cmd("reg");
    command.args(["query", AUTOSTART_REG_KEY, "/v", AUTOSTART_VALUE]);
    command
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

const NINA_PLUGIN_FOLDER: &str = "BoreanAstro.Plugin";
const NINA_PLUGIN_DLL: &str = "BoreanAstro.Plugin.dll";
const NINA_PLUGIN_VERSION_FILE: &str = "version.txt";
/// Matches `nina-plugins/BoreanAstro.Plugin/version.txt` when bundle metadata is missing.
const BUNDLED_NINA_PLUGIN_VERSION: &str = "0.1.1";

#[derive(Debug, Clone)]
pub struct NinaPluginDiagnostics {
    pub installed: bool,
    pub installed_version: Option<String>,
    pub bundled_version: String,
    pub update_available: bool,
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

fn read_trimmed_text(path: &Path) -> Option<String> {
    fs::read_to_string(path)
        .ok()
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

fn bundled_plugin_version(source_candidates: &[PathBuf]) -> String {
    for dir in source_candidates {
        if let Some(version) = read_trimmed_text(&dir.join(NINA_PLUGIN_VERSION_FILE)) {
            return version;
        }
    }
    BUNDLED_NINA_PLUGIN_VERSION.to_string()
}

fn read_dll_file_version(dll: &Path) -> Option<String> {
    let path_str = dll.display().to_string().replace('\'', "''");
    let script = format!("(Get-Item -LiteralPath '{path_str}').VersionInfo.FileVersion");
    let output = hidden_cmd("powershell")
        .args(["-NoProfile", "-Command", &script])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if version.is_empty() {
        None
    } else {
        Some(version)
    }
}

fn read_installed_plugin_version(dll_path: &Path) -> Option<String> {
    if let Some(parent) = dll_path.parent() {
        if let Some(version) = read_trimmed_text(&parent.join(NINA_PLUGIN_VERSION_FILE)) {
            return Some(version);
        }
    }
    read_dll_file_version(dll_path)
}

/// Compare installed plugin against the bundle shipped with this Station build.
pub fn nina_plugin_diagnostics(source_candidates: &[PathBuf]) -> NinaPluginDiagnostics {
    let bundled_version = bundled_plugin_version(source_candidates);
    let Some(dll_path) = nina_plugin_install_path() else {
        return NinaPluginDiagnostics {
            installed: false,
            installed_version: None,
            bundled_version,
            update_available: false,
        };
    };

    let installed_version = read_installed_plugin_version(&dll_path);
    let update_available = installed_version
        .as_ref()
        .map(|installed| compare_versions(installed, &bundled_version) == std::cmp::Ordering::Less)
        .unwrap_or(true);

    NinaPluginDiagnostics {
        installed: true,
        installed_version,
        bundled_version,
        update_available,
    }
}

/// True when the Borean NINA plugin is present under %LOCALAPPDATA%\NINA\Plugins.
pub fn nina_plugin_installed() -> bool {
    nina_plugin_install_path().is_some()
}

fn nina_plugin_install_path() -> Option<PathBuf> {
    let local = std::env::var("LOCALAPPDATA").ok()?;
    let plugins_root = PathBuf::from(local).join("NINA").join("Plugins");
    let entries = fs_read_dir(&plugins_root).ok()?;
    for entry in entries {
        let version_dir = entry.path();
        if !version_dir.is_dir() {
            continue;
        }
        let dll = version_dir
            .join(NINA_PLUGIN_FOLDER)
            .join(NINA_PLUGIN_DLL);
        if dll.is_file() {
            return Some(dll);
        }
    }
    None
}

fn nina_plugins_root() -> Result<PathBuf, String> {
    let local = std::env::var("LOCALAPPDATA")
        .map_err(|_| "LOCALAPPDATA is not set.".to_string())?;
    let root = PathBuf::from(local).join("NINA").join("Plugins");
    fs::create_dir_all(&root).map_err(|e| format!("Cannot create {}: {e}", root.display()))?;
    Ok(root)
}

/// Pick NINA's plugin API version folder (e.g. 3.0.0), preferring the newest 3.x already present.
fn resolve_nina_plugin_version_folder(plugins_root: &Path) -> String {
    let mut versions: Vec<String> = Vec::new();
    if let Ok(entries) = fs_read_dir(plugins_root) {
        for entry in entries {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            if name.starts_with("3.") || name.chars().next().is_some_and(|c| c.is_ascii_digit()) {
                versions.push(name.to_string());
            }
        }
    }
    versions.sort();
    versions
        .into_iter()
        .next_back()
        .unwrap_or_else(|| "3.0.0".to_string())
}

fn is_nina_running() -> bool {
    hidden_cmd("tasklist")
        .args(["/FI", "IMAGENAME eq NINA.exe", "/NH"])
        .output()
        .map(|output| {
            if !output.status.success() {
                return false;
            }
            String::from_utf8_lossy(&output.stdout)
                .to_ascii_uppercase()
                .contains("NINA.EXE")
        })
        .unwrap_or(false)
}

const NINA_PLUGIN_LOCK_HINT: &str =
    "Close NINA completely, then try again. NINA locks plugin files while it is running.";

fn dotnet_available() -> bool {
    hidden_cmd("dotnet")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn try_dotnet_publish_plugin(csproj: &Path, out_dir: &Path) -> Result<(), String> {
    if !csproj.is_file() {
        return Err(format!("Plugin project not found: {}", csproj.display()));
    }
    if !dotnet_available() {
        return Err(
            ".NET SDK not found. Install .NET 8 SDK or reinstall Station from the full Windows installer."
                .into(),
        );
    }
    let _ = fs::remove_dir_all(out_dir);
    fs::create_dir_all(out_dir).map_err(|e| format!("Cannot create {}: {e}", out_dir.display()))?;

    append_install_log(&format!(
        "Building NINA plugin via dotnet publish → {}",
        out_dir.display()
    ));

    let mut command = hidden_cmd("dotnet");
    command.args([
        "publish",
        &csproj.to_string_lossy(),
        "-c",
        "Release",
        "-o",
        &out_dir.to_string_lossy(),
    ]);
    let output = command
        .output()
        .map_err(|e| format!("Could not run dotnet publish: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    if !stdout.trim().is_empty() {
        append_install_log(&format!("dotnet stdout: {stdout}"));
    }
    if !stderr.trim().is_empty() {
        append_install_log(&format!("dotnet stderr: {stderr}"));
    }

    if !output.status.success() {
        return Err("dotnet publish failed. Install .NET 8 SDK or use the full Station installer.".into());
    }

    let dll = out_dir.join(NINA_PLUGIN_DLL);
    if !dll.is_file() {
        return Err(format!(
            "Plugin build finished but {} was not produced.",
            NINA_PLUGIN_DLL
        ));
    }
    Ok(())
}

fn find_plugin_source_dir(candidates: &[PathBuf]) -> Option<PathBuf> {
    for dir in candidates {
        if dir.join(NINA_PLUGIN_DLL).is_file() {
            return Some(dir.clone());
        }
    }
    None
}

fn copy_plugin_payload(source: &Path, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| format!("Cannot create {}: {e}", dest.display()))?;

    let entries = fs_read_dir(source)?;
    let mut copied = 0usize;
    for entry in entries {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = entry.file_name();
        let target = dest.join(&name);
        fs::copy(&path, &target).map_err(|e| {
            let detail = format!("Cannot copy {}: {e}", path.display());
            if is_nina_running()
                || detail.contains("Access is denied")
                || detail.contains("os error 5")
            {
                format!("{detail} {NINA_PLUGIN_LOCK_HINT}")
            } else {
                detail
            }
        })?;
        copied += 1;
    }

    if copied == 0 {
        return Err(format!("No plugin files found in {}", source.display()));
    }
    Ok(())
}

/// Copy bundled (or freshly built) plugin files into NINA's user plugin folder.
pub fn install_nina_plugin(
    source_candidates: &[PathBuf],
    csproj_fallback: Option<&Path>,
    force_update: bool,
) -> Result<String, String> {
    if nina_plugin_installed() && !force_update {
        let path = nina_plugin_install_path()
            .map(|p| p.display().to_string())
            .unwrap_or_else(|| NINA_PLUGIN_DLL.into());
        append_install_log(&format!("NINA plugin already installed at {path}"));
        return Ok(format!("Already installed ({path})"));
    }

    if is_nina_running() {
        let msg = format!("Cannot install plugin while NINA is running. {NINA_PLUGIN_LOCK_HINT}");
        append_install_log(&msg);
        return Err(msg);
    }

    let mut source = find_plugin_source_dir(source_candidates);

    if source.is_none() {
        if let Some(csproj) = csproj_fallback {
            let build_dir = station_data_dir().join(".nina-plugin-build");
            if try_dotnet_publish_plugin(csproj, &build_dir).is_ok() {
                source = Some(build_dir);
            }
        }
    }

    let source = source.ok_or_else(|| {
        "Plugin bundle missing from this Station install and automatic build failed. \
         Reinstall Station using build-windows.ps1 on Windows, or install .NET 8 SDK and retry."
            .to_string()
    })?;

    let plugins_root = nina_plugins_root()?;
    let version = resolve_nina_plugin_version_folder(&plugins_root);
    let dest = plugins_root
        .join(version)
        .join(NINA_PLUGIN_FOLDER);

    copy_plugin_payload(&source, &dest)?;

    let dll = dest.join(NINA_PLUGIN_DLL);
    if !dll.is_file() {
        return Err(format!(
            "Install copy finished but {} is missing.",
            dll.display()
        ));
    }

    let msg = if force_update {
        format!("Updated Borean Astro plugin to {}", dest.display())
    } else {
        format!("Installed Borean Astro plugin to {}", dest.display())
    };
    append_install_log(&msg);
    Ok(msg)
}

fn station_data_dir() -> PathBuf {
    if let Ok(base) = std::env::var("LOCALAPPDATA") {
        return PathBuf::from(base).join("BoreanAstro").join("Station");
    }
    PathBuf::from(".")
}

pub fn enable_autostart(exe_path: &Path) -> Result<(), String> {
    if !exe_path.is_file() {
        return Err(format!("Station executable not found: {}", exe_path.display()));
    }
    let quoted = format!("\"{}\"", exe_path.display());
    let mut command = hidden_cmd("reg");
    command.args([
        "add",
        AUTOSTART_REG_KEY,
        "/v",
        AUTOSTART_VALUE,
        "/t",
        "REG_SZ",
        "/d",
        &quoted,
        "/f",
    ]);
    let output = command
        .output()
        .map_err(|e| format!("Could not update registry: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Registry autostart failed: {stderr}"));
    }
    Ok(())
}
