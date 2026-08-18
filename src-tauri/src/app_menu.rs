//! Native right-click menu for app tiles.
//!
//! Tauri's menu API (muda) can only attach legacy named template images to
//! items, which look nothing like the SF Symbols the macOS Apps app uses.
//! This builds the NSMenu directly so items carry real SF Symbol images;
//! the chosen action is emitted to the frontend as an "app-menu-action"
//! event, keeping every action flow (launch animation, close-on-handoff)
//! in one place there.

use crate::AppError;

/// Show the context menu for an app tile at the current cursor position.
/// Sync command: runs on the main thread, which AppKit requires; blocks
/// until the menu is dismissed, so the frontend can await the popup.
#[tauri::command]
pub(crate) fn show_app_menu(window: tauri::WebviewWindow, path: String) -> Result<(), AppError> {
    #[cfg(target_os = "macos")]
    return macos::show(&window, path);

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, path);
        Err(AppError::Validation(
            "App menu is only available on macOS".into(),
        ))
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use std::cell::RefCell;

    use objc2::rc::Retained;
    use objc2::{define_class, msg_send, sel, DefinedClass, MainThreadMarker, MainThreadOnly};
    use objc2_app_kit::{NSEvent, NSImage, NSMenu, NSMenuItem};
    use objc2_foundation::{NSObject, NSObjectProtocol, NSString};
    use serde::Serialize;
    use tauri::{Emitter, Manager};

    use crate::AppError;

    /// Menu title, SF Symbol name, action id — the index doubles as the
    /// NSMenuItem tag. Symbols mirror the Apps app's context menu.
    const ITEMS: [(&str, &str, &str); 4] = [
        ("Open", "arrow.up.forward.app", "open"),
        ("Show in Finder", "finder", "show-in-finder"),
        ("Get Info", "info.circle", "get-info"),
        ("Quick Look", "eye", "quick-look"),
    ];

    #[derive(Clone, Serialize)]
    struct ActionPayload {
        action: &'static str,
        path: String,
    }

    struct HandlerIvars {
        app: tauri::AppHandle,
        path: String,
    }

    define_class!(
        #[unsafe(super(NSObject))]
        #[thread_kind = MainThreadOnly]
        #[name = "WafflepadAppMenuHandler"]
        #[ivars = HandlerIvars]
        struct MenuHandler;

        unsafe impl NSObjectProtocol for MenuHandler {}

        impl MenuHandler {
            #[unsafe(method(menuAction:))]
            fn menu_action(&self, sender: &NSMenuItem) {
                let Some((_, _, action)) = usize::try_from(sender.tag())
                    .ok()
                    .and_then(|index| ITEMS.get(index))
                else {
                    return;
                };
                let _ = self.ivars().app.emit(
                    "app-menu-action",
                    ActionPayload {
                        action,
                        path: self.ivars().path.clone(),
                    },
                );
            }
        }
    );

    impl MenuHandler {
        fn new(mtm: MainThreadMarker, app: tauri::AppHandle, path: String) -> Retained<Self> {
            let this = Self::alloc(mtm).set_ivars(HandlerIvars { app, path });
            unsafe { msg_send![super(this), init] }
        }
    }

    thread_local! {
        /// NSMenuItem.target is weak and the selection action can be
        /// delivered after the popup call returns — keep the last handler
        /// alive until the next menu replaces it (same pattern as
        /// dock_drag's ACTIVE_SOURCE).
        static ACTIVE_HANDLER: RefCell<Option<Retained<MenuHandler>>> =
            const { RefCell::new(None) };
    }

    pub(super) fn show(window: &tauri::WebviewWindow, path: String) -> Result<(), AppError> {
        let mtm = MainThreadMarker::new().ok_or_else(|| {
            AppError::Validation("show_app_menu must run on the main thread".into())
        })?;

        let handler = MenuHandler::new(mtm, window.app_handle().clone(), path);

        let menu = NSMenu::new(mtm);
        menu.setAutoenablesItems(false);

        for (index, (title, symbol, _)) in ITEMS.iter().enumerate() {
            let item = NSMenuItem::new(mtm);
            item.setTitle(&NSString::from_str(title));
            item.setTag(index as isize);
            unsafe {
                item.setTarget(Some(&handler));
                item.setAction(Some(sel!(menuAction:)));
            }
            let image = NSImage::imageWithSystemSymbolName_accessibilityDescription(
                &NSString::from_str(symbol),
                None,
            );
            if let Some(image) = image {
                item.setImage(Some(&image));
            }
            menu.addItem(&item);
        }

        ACTIVE_HANDLER.with(|slot| *slot.borrow_mut() = Some(handler));

        // Blocks until the menu is dismissed. With no view given, the
        // location is interpreted in screen coordinates — so this pops up
        // at the current cursor position.
        menu.popUpMenuPositioningItem_atLocation_inView(None, NSEvent::mouseLocation(), None);
        Ok(())
    }
}
