use std::{env, fs, path::PathBuf};

fn main() {
    // Tauri validates the fixed-runtime resource path even for `cargo test`.
    // Keep the source tree buildable without redistributing Microsoft's runtime.
    let manifest_directory =
        PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").expect("Cargo sets CARGO_MANIFEST_DIR"));
    fs::create_dir_all(manifest_directory.join("WebView2Fixed"))
        .expect("create ignored WebView2 Fixed Runtime staging directory");
    tauri_build::build()
}
