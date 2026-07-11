use std::env;
use std::fs;
use std::path::Path;

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
    println!("cargo:rerun-if-changed={}", config_path.display());
    tauri_build::build();
}
