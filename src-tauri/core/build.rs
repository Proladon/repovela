fn main() {
    // libgit2's read-only Windows build still uses security and registry APIs.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        println!("cargo:rustc-link-lib=advapi32");
    }
}
