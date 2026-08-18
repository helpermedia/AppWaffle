fn main() {
    #[cfg(target_os = "macos")]
    compile_quick_look_helper();

    tauri_build::build()
}

/// Compile the Quick Look helper (helpers/quick-look.swift) into the
/// sidecar location tauri's externalBin expects:
/// binaries/quick-look-helper-<target-triple>. Compiling here rather than
/// at runtime means the shipped app needs no Swift toolchain and the
/// panel opens without a compile delay.
#[cfg(target_os = "macos")]
fn compile_quick_look_helper() {
    use std::process::Command;

    println!("cargo:rerun-if-changed=helpers/quick-look.swift");

    let target = std::env::var("TARGET").expect("cargo sets TARGET");
    // Lets the app resolve the uncopied binary in dev runs
    println!("cargo:rustc-env=WAFFLEPAD_TARGET_TRIPLE={target}");

    let arch = if target.starts_with("aarch64") {
        "arm64"
    } else {
        "x86_64"
    };
    std::fs::create_dir_all("binaries").expect("failed to create binaries dir");
    let out = format!("binaries/quick-look-helper-{target}");

    let status = Command::new("swiftc")
        .args([
            "-O",
            "-target",
            &format!("{arch}-apple-macosx11.0"),
            "-o",
            &out,
            "helpers/quick-look.swift",
        ])
        .status()
        .expect("swiftc is required to build the Quick Look helper (install Xcode command line tools)");
    assert!(status.success(), "failed to compile helpers/quick-look.swift");
}
