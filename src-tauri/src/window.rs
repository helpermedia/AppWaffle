#[cfg(target_os = "macos")]
use objc2::{msg_send, runtime::AnyObject, MainThreadMarker};
#[cfg(target_os = "macos")]
use objc2_app_kit::{NSApplication, NSApplicationPresentationOptions, NSScreen, NSWindow};
#[cfg(target_os = "macos")]
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

/// macOS window level above Dock and menu bar (Launchpad-style).
/// Corresponds to kCGPopUpMenuWindowLevelKey (private API).
#[cfg(target_os = "macos")]
const LAUNCHPAD_WINDOW_LEVEL: isize = 19;

#[cfg(target_os = "macos")]
pub(crate) fn setup_window(window: &tauri::WebviewWindow) {
    let mtm = MainThreadMarker::new().expect("Must be on main thread");

    apply_vibrancy(window, NSVisualEffectMaterial::HudWindow, None, None)
        .expect("Failed to apply vibrancy");

    let app = NSApplication::sharedApplication(mtm);
    app.setPresentationOptions(NSApplicationPresentationOptions::AutoHideMenuBar);

    if let Some(screen) = NSScreen::mainScreen(mtm) {
        let frame = screen.frame();

        if let Ok(handle) = window.window_handle() {
            if let RawWindowHandle::AppKit(appkit) = handle.as_raw() {
                unsafe {
                    let ns_view = appkit.ns_view.as_ptr() as *mut AnyObject;
                    let ns_window: *mut NSWindow = msg_send![ns_view, window];

                    if !ns_window.is_null() {
                        (*ns_window).setFrame_display(frame, true);
                        (*ns_window).setLevel(LAUNCHPAD_WINDOW_LEVEL);
                        (*ns_window).setHasShadow(false);
                    }
                }
            }
        }
    }
}
