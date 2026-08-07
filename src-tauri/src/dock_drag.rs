//! Native drag-out to the macOS Dock (Launchpad-style pinning).
//!
//! A DOM drag can never leave the webview, so when the frontend detects the
//! pointer entering the Dock's screen region it calls `start_dock_drag`,
//! which hands the in-flight gesture to an `NSDraggingSession` carrying the
//! app bundle's file URL. The Dock pins any application file URL dropped on
//! it — no Dock API involved. Because the AppWaffle window covers the whole
//! screen just below the Dock's window level, the Dock is the only external
//! drop target the session can reach.

use serde::{Deserialize, Serialize};

use crate::AppError;

/// Current DOM ghost rect in CSS pixels (top-left origin, viewport coords),
/// used to place the native drag image exactly where the ghost was hidden.
#[derive(Debug, Clone, Copy, Deserialize)]
pub(crate) struct GhostRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Screen region (CSS pixels, top-left origin) where a drag should hand off
/// to a native session targeting the Dock.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DockZone {
    pub side: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub auto_hide: bool,
}

/// Where the Dock lives on the main screen. Sync command: runs on the main
/// thread, which AppKit requires.
#[tauri::command]
pub(crate) fn get_dock_drag_zone() -> Result<DockZone, AppError> {
    #[cfg(target_os = "macos")]
    return macos::dock_drag_zone();

    #[cfg(not(target_os = "macos"))]
    Err(AppError::Validation(
        "Dock drag is only available on macOS".into(),
    ))
}

/// Hand the active pointer drag off to a native drag session carrying the
/// app's file URL, so it can be dropped on the Dock. Must be called while
/// the left mouse button is still down. Sync command: runs on the main
/// thread, which AppKit requires.
#[tauri::command]
pub(crate) fn start_dock_drag(
    window: tauri::WebviewWindow,
    app_path: String,
    ghost_rect: Option<GhostRect>,
) -> Result<(), AppError> {
    // Same validation as launch_app: only real app bundles from the
    // discovered application directories can leave the window.
    let canonical = std::path::PathBuf::from(&app_path).canonicalize()?;
    if !canonical.extension().map_or(false, |ext| ext == "app") {
        return Err(AppError::Validation("Invalid app path".into()));
    }
    let allowed = crate::app_discovery::get_applications_dirs();
    if !allowed.iter().any(|dir| canonical.starts_with(dir)) {
        return Err(AppError::Validation("App not in allowed directory".into()));
    }

    #[cfg(target_os = "macos")]
    return macos::start(&window, &canonical.to_string_lossy(), ghost_rect);

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, ghost_rect);
        Err(AppError::Validation(
            "Dock drag is only available on macOS".into(),
        ))
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use std::cell::RefCell;

    use core_foundation::base::{CFType, TCFType};
    use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
    use core_foundation::number::CFNumber;
    use core_foundation::string::CFString;
    use core_graphics::geometry::CGRect;
    use core_graphics::window::{
        copy_window_info, kCGNullWindowID, kCGWindowListOptionOnScreenOnly,
    };
    use objc2::rc::Retained;
    use objc2::runtime::ProtocolObject;
    use objc2::{define_class, msg_send, AnyThread, DefinedClass, MainThreadMarker, MainThreadOnly};
    use objc2_app_kit::{
        NSApplication, NSDragOperation, NSDraggingContext, NSDraggingItem, NSDraggingSession,
        NSDraggingSource, NSEvent, NSEventType, NSPasteboardItem, NSPasteboardTypeFileURL,
        NSScreen, NSView, NSWorkspace,
    };
    use objc2_foundation::{
        ns_string, NSArray, NSObject, NSObjectProtocol, NSPoint, NSRect, NSSize, NSString, NSURL,
        NSUserDefaults,
    };
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    use tauri::Manager;

    use super::{DockZone, GhostRect};
    use crate::AppError;

    /// Size of the native drag image when the frontend can't supply the
    /// ghost rect. Matches the grid's default icon size.
    const FALLBACK_DRAG_SIZE: f64 = 96.0;

    /// Thin trigger strip along the screen edge — used when the Dock
    /// auto-hides (reserves no space) and as fallback when its footprint
    /// can't be resolved.
    const EDGE_STRIP: f64 = 8.0;

    struct SourceIvars {
        app: tauri::AppHandle,
    }

    define_class!(
        #[unsafe(super(NSObject))]
        #[thread_kind = MainThreadOnly]
        #[name = "AppWaffleDockDragSource"]
        #[ivars = SourceIvars]
        struct DockDragSource;

        unsafe impl NSObjectProtocol for DockDragSource {}

        unsafe impl NSDraggingSource for DockDragSource {
            #[unsafe(method(draggingSession:sourceOperationMaskForDraggingContext:))]
            fn source_operation_mask(
                &self,
                _session: &NSDraggingSession,
                _context: NSDraggingContext,
            ) -> NSDragOperation {
                // Generic is what the Dock performs when pinning; Copy and
                // Link keep pickier system targets from rejecting the hover
                // outright. Nothing else is reachable anyway: the
                // full-screen window shields every drop target below it.
                NSDragOperation::Generic | NSDragOperation::Copy | NSDragOperation::Link
            }

            #[unsafe(method(draggingSession:endedAtPoint:operation:))]
            fn dragging_session_ended(
                &self,
                _session: &NSDraggingSession,
                _point: NSPoint,
                _operation: NSDragOperation,
            ) {
                // Session over: re-arm the focus-loss close suppressed in
                // start(). Runs for both dropped and cancelled sessions.
                crate::IS_DOCK_DRAGGING.store(false, std::sync::atomic::Ordering::SeqCst);

                // The Focused(false) edge is gone if focus was lost while
                // the session suppressed it (e.g. the drop landed on
                // another app's tile and activated it). Re-check now and
                // schedule the same delayed close the handler would have —
                // unless a quit is already scheduled (IS_LAUNCHING).
                let app = self.ivars().app.clone();
                let focused = app
                    .get_webview_window("main")
                    .and_then(|w| w.is_focused().ok())
                    .unwrap_or(true);
                if !focused
                    && !crate::IS_LAUNCHING.swap(true, std::sync::atomic::Ordering::SeqCst)
                {
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(300));
                        crate::graceful_exit(&app);
                    });
                }
            }
        }
    );

    impl DockDragSource {
        fn new(mtm: MainThreadMarker, app: tauri::AppHandle) -> Retained<Self> {
            let this = Self::alloc(mtm).set_ivars(SourceIvars { app });
            unsafe { msg_send![super(this), init] }
        }
    }

    thread_local! {
        /// Keeps the dragging source alive for the session's lifetime.
        /// Main-thread only, like every AppKit object here.
        ///
        /// Deliberately NOT cleared in dragging_session_ended: dropping the
        /// last reference there would deallocate the source in the middle
        /// of its own callback. The stale entry is replaced on the next
        /// drag instead.
        static ACTIVE_SOURCE: RefCell<Option<Retained<DockDragSource>>> =
            const { RefCell::new(None) };
    }

    pub(super) fn start(
        window: &tauri::WebviewWindow,
        app_path: &str,
        ghost_rect: Option<GhostRect>,
    ) -> Result<(), AppError> {
        let mtm = MainThreadMarker::new().ok_or_else(|| {
            AppError::Validation("start_dock_drag must run on the main thread".into())
        })?;

        // The session adopts the in-flight mouse gesture; if the button was
        // released while the invoke was in transit, there is nothing to
        // adopt and the frontend should let the DOM drag finish normally.
        if NSEvent::pressedMouseButtons() & 1 == 0 {
            return Err(AppError::Validation("Mouse button no longer down".into()));
        }

        let app = NSApplication::sharedApplication(mtm);
        let event = app
            .currentEvent()
            .ok_or_else(|| AppError::Validation("No current event".into()))?;
        let event_type = event.r#type();
        if !matches!(
            event_type,
            NSEventType::LeftMouseDragged | NSEventType::LeftMouseDown
        ) {
            return Err(AppError::Validation("No active mouse drag".into()));
        }

        let view = ns_view(window)?;

        // Pasteboard item carrying the .app file URL — the same payload
        // Finder writes when an app is dragged, and what the Dock pins.
        let url = NSURL::fileURLWithPath(&NSString::from_str(app_path));
        let url_string = url
            .absoluteString()
            .ok_or_else(|| AppError::Validation("Invalid app path".into()))?;
        let pasteboard_item = NSPasteboardItem::new();
        let wrote = unsafe {
            pasteboard_item.setString_forType(&url_string, NSPasteboardTypeFileURL)
        };
        if !wrote {
            return Err(AppError::Validation("Failed to write pasteboard".into()));
        }

        let drag_item = NSDraggingItem::initWithPasteboardWriter(
            NSDraggingItem::alloc(),
            ProtocolObject::from_ref(&*pasteboard_item),
        );

        // Drag image: the app's icon, framed exactly where the DOM ghost was
        // hidden so the swap is seamless.
        let icon = NSWorkspace::sharedWorkspace().iconForFile(&NSString::from_str(app_path));
        let frame = drag_frame(view, ghost_rect, &event);
        unsafe {
            icon.setSize(frame.size);
            drag_item.setDraggingFrame_contents(frame, Some(&icon));
        }

        let source = DockDragSource::new(mtm, window.app_handle().clone());

        // While the session owns the mouse, a stray focus change must not
        // quit the app mid-drag. Cleared in draggingSession:endedAtPoint:.
        crate::IS_DOCK_DRAGGING.store(true, std::sync::atomic::Ordering::SeqCst);

        let items = NSArray::from_retained_slice(&[drag_item]);
        let session = view.beginDraggingSessionWithItems_event_source(
            &items,
            &event,
            ProtocolObject::from_ref(&*source),
        );
        // A rejected drop should dissolve in place: the grid icon is already
        // restored, so flying the image back to the handoff point would
        // point at nothing.
        session.setAnimatesToStartingPositionsOnCancelOrFail(false);

        ACTIVE_SOURCE.with(|slot| *slot.borrow_mut() = Some(source));
        Ok(())
    }

    pub(super) fn dock_drag_zone() -> Result<DockZone, AppError> {
        let mtm = MainThreadMarker::new().ok_or_else(|| {
            AppError::Validation("get_dock_drag_zone must run on the main thread".into())
        })?;
        let screen = NSScreen::mainScreen(mtm)
            .ok_or_else(|| AppError::Validation("No main screen".into()))?;
        let frame = screen.frame();
        let visible = screen.visibleFrame();

        // visibleFrame excludes the space the Dock reserves; the difference
        // per edge is the Dock band. AppKit uses bottom-left origin, the
        // frontend top-left, hence the y flips.
        const EPS: f64 = 1.0;
        let bottom = visible.origin.y - frame.origin.y;
        let left = visible.origin.x - frame.origin.x;
        let right =
            (frame.origin.x + frame.size.width) - (visible.origin.x + visible.size.width);

        let (side, band) = if bottom > EPS {
            (
                "bottom",
                Rect {
                    x: 0.0,
                    y: frame.size.height - bottom,
                    width: frame.size.width,
                    height: bottom,
                },
            )
        } else if left > EPS {
            (
                "left",
                Rect {
                    x: 0.0,
                    y: 0.0,
                    width: left,
                    height: frame.size.height,
                },
            )
        } else if right > EPS {
            (
                "right",
                Rect {
                    x: frame.size.width - right,
                    y: 0.0,
                    width: right,
                    height: frame.size.height,
                },
            )
        } else {
            // Auto-hidden Dock reserves no space: use a thin strip on its
            // configured side. The OS reveals the Dock once the native drag
            // hovers that edge.
            let side = dock_orientation();
            let strip = edge_strip(&side, frame.size);
            return Ok(zone(&side, strip, true));
        };

        // The reserved band spans the whole screen edge, but grid icons can
        // scroll into it — a full-band trigger would hijack their reorder
        // drags into the native session. Restrict the zone to the Dock's
        // actual footprint, falling back to a thin edge strip when the
        // window list yields nothing.
        let rect =
            dock_footprint_in_band(mtm, frame, band).unwrap_or_else(|| edge_strip(side, frame.size));
        Ok(zone(side, rect, false))
    }

    /// Trigger rect within the reserved band: the union of the Dock's
    /// on-screen windows clipped to the band, in CSS coordinates.
    fn dock_footprint_in_band(
        mtm: MainThreadMarker,
        screen_frame: NSRect,
        band: Rect,
    ) -> Option<Rect> {
        // CGWindowList reports global coordinates with a top-left origin
        // anchored to the primary display; convert into this screen's CSS
        // space (same origin flip as the band math above).
        let primary_height = NSScreen::screens(mtm).firstObject()?.frame().size.height;
        let screen_cg_x = screen_frame.origin.x;
        let screen_cg_y = primary_height - (screen_frame.origin.y + screen_frame.size.height);

        let windows = copy_window_info(kCGWindowListOptionOnScreenOnly, kCGNullWindowID)?;
        let mut footprint: Option<Rect> = None;

        for item in windows.iter() {
            let dict: CFDictionary<CFString, CFType> =
                unsafe { CFDictionary::wrap_under_get_rule(*item as CFDictionaryRef) };

            let is_dock = dict
                .find(CFString::from_static_string("kCGWindowOwnerName"))
                .and_then(|value| value.downcast::<CFString>())
                .map_or(false, |owner| owner.to_string() == "Dock");
            // The Dock process also draws desktop wallpaper windows at
            // negative layers; only positive layers are the Dock itself.
            let layer = dict
                .find(CFString::from_static_string("kCGWindowLayer"))
                .and_then(|value| value.downcast::<CFNumber>())
                .and_then(|number| number.to_i64())
                .unwrap_or(-1);
            if !is_dock || layer <= 0 {
                continue;
            }

            let Some(bounds) = dict
                .find(CFString::from_static_string("kCGWindowBounds"))
                .and_then(|value| value.downcast::<CFDictionary>())
                .and_then(|bounds_dict| CGRect::from_dict_representation(&bounds_dict))
            else {
                continue;
            };

            let window_rect = Rect {
                x: bounds.origin.x - screen_cg_x,
                y: bounds.origin.y - screen_cg_y,
                width: bounds.size.width,
                height: bounds.size.height,
            };
            let Some(clipped) = intersect(window_rect, band) else {
                continue;
            };
            footprint = Some(match footprint {
                Some(existing) => bounding(existing, clipped),
                None => clipped,
            });
        }
        footprint
    }

    /// Axis-aligned rect in CSS coordinates (top-left origin).
    #[derive(Clone, Copy)]
    struct Rect {
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    }

    fn zone(side: &str, rect: Rect, auto_hide: bool) -> DockZone {
        DockZone {
            side: side.to_string(),
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            auto_hide,
        }
    }

    /// Thin trigger strip along a screen edge; conservative enough to never
    /// sit on top of grid icons.
    fn edge_strip(side: &str, size: NSSize) -> Rect {
        match side {
            "left" => Rect {
                x: 0.0,
                y: 0.0,
                width: EDGE_STRIP,
                height: size.height,
            },
            "right" => Rect {
                x: size.width - EDGE_STRIP,
                y: 0.0,
                width: EDGE_STRIP,
                height: size.height,
            },
            _ => Rect {
                x: 0.0,
                y: size.height - EDGE_STRIP,
                width: size.width,
                height: EDGE_STRIP,
            },
        }
    }

    fn intersect(a: Rect, b: Rect) -> Option<Rect> {
        let x1 = a.x.max(b.x);
        let y1 = a.y.max(b.y);
        let x2 = (a.x + a.width).min(b.x + b.width);
        let y2 = (a.y + a.height).min(b.y + b.height);
        (x2 > x1 && y2 > y1).then(|| Rect {
            x: x1,
            y: y1,
            width: x2 - x1,
            height: y2 - y1,
        })
    }

    fn bounding(a: Rect, b: Rect) -> Rect {
        let x1 = a.x.min(b.x);
        let y1 = a.y.min(b.y);
        let x2 = (a.x + a.width).max(b.x + b.width);
        let y2 = (a.y + a.height).max(b.y + b.height);
        Rect {
            x: x1,
            y: y1,
            width: x2 - x1,
            height: y2 - y1,
        }
    }

    /// Dock position from the Dock's own preferences; defaults to bottom.
    fn dock_orientation() -> String {
        NSUserDefaults::initWithSuiteName(
            NSUserDefaults::alloc(),
            Some(ns_string!("com.apple.dock")),
        )
        .and_then(|defaults| defaults.stringForKey(ns_string!("orientation")))
        .map(|s| s.to_string())
        .unwrap_or_else(|| "bottom".into())
    }

    /// Where to place the native drag image, in the view's coordinates.
    fn drag_frame(view: &NSView, ghost_rect: Option<GhostRect>, event: &NSEvent) -> NSRect {
        let bounds = view.bounds();
        match ghost_rect {
            Some(g) => {
                // CSS pixels map 1:1 to points; only the y origin differs
                // when the view isn't flipped.
                let y = if view.isFlipped() {
                    g.y
                } else {
                    bounds.size.height - g.y - g.height
                };
                NSRect::new(NSPoint::new(g.x, y), NSSize::new(g.width, g.height))
            }
            None => {
                // No ghost to match: center the image on the cursor.
                let location = event.locationInWindow();
                let point = view.convertPoint_fromView(location, None);
                NSRect::new(
                    NSPoint::new(
                        point.x - FALLBACK_DRAG_SIZE / 2.0,
                        point.y - FALLBACK_DRAG_SIZE / 2.0,
                    ),
                    NSSize::new(FALLBACK_DRAG_SIZE, FALLBACK_DRAG_SIZE),
                )
            }
        }
    }

    fn ns_view(window: &tauri::WebviewWindow) -> Result<&NSView, AppError> {
        let handle = window
            .window_handle()
            .map_err(|e| AppError::Validation(format!("No window handle: {e}")))?;
        match handle.as_raw() {
            RawWindowHandle::AppKit(appkit) => {
                // SAFETY: the pointer is a live NSView owned by the window,
                // and we're on the main thread for the whole call.
                Ok(unsafe { &*(appkit.ns_view.as_ptr() as *const NSView) })
            }
            _ => Err(AppError::Validation("Not an AppKit window".into())),
        }
    }
}
