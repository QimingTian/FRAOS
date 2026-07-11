use std::env;
use std::fs;
use std::path::Path;

fn edition_config_path(manifest_dir: &str) -> std::path::PathBuf {
    Path::new(manifest_dir).join("../../build-config/edition.json")
}

fn read_edition_slug(edition_path: &Path) -> String {
    let raw = fs::read_to_string(edition_path).unwrap_or_else(|_| r#"{"slug":"standard"}"#.to_string());
    raw.split("\"slug\"")
        .nth(1)
        .and_then(|rest| rest.split('"').nth(1))
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("standard")
        .to_string()
}

fn main() {
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR");
    let config_path = if Path::new(&manifest_dir)
        .join("../../build-config/tenant.json")
        .exists()
    {
        Path::new(&manifest_dir).join("../../build-config/tenant.json")
    } else {
        Path::new(&manifest_dir).join("../../build-config/tenant.dev.json")
    };
    let out_dir = env::var("OUT_DIR").expect("OUT_DIR");
    let dest = Path::new(&out_dir).join("tenant_config.json");
    fs::copy(&config_path, &dest).expect("copy tenant config");

    let edition_path = edition_config_path(&manifest_dir);
    let edition_slug = read_edition_slug(&edition_path);
    fs::write(
        Path::new(&out_dir).join("edition_slug.txt"),
        edition_slug.as_bytes(),
    )
    .expect("write edition slug");

    println!("cargo:rerun-if-changed={}", config_path.display());
    println!("cargo:rerun-if-changed={}", edition_path.display());
    tauri_build::build();
}
