// Quick Look helper: presents a real QLPreviewPanel for the path given as
// argv[1]. Lives in its own process so the panel can outlive the launcher;
// compiled at build time (build.rs) and bundled beside the app binary.
// qlmanage is not an option: it is a debug tool and titles its panel
// "[DEBUG]".
import AppKit
import Quartz

final class DataSource: NSObject, QLPreviewPanelDataSource {
    let url: NSURL
    init(url: NSURL) { self.url = url }
    func numberOfPreviewItems(in panel: QLPreviewPanel!) -> Int { 1 }
    func previewPanel(_ panel: QLPreviewPanel!, previewItemAt index: Int) -> QLPreviewItem! { url }
}

guard CommandLine.arguments.count > 1 else { exit(1) }
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let dataSource = DataSource(url: NSURL(fileURLWithPath: CommandLine.arguments[1]))
guard let panel = QLPreviewPanel.shared() else { exit(1) }
panel.dataSource = dataSource
let center = NotificationCenter.default
center.addObserver(forName: NSWindow.willCloseNotification, object: panel, queue: .main) { _ in
    app.terminate(nil)
}
center.addObserver(forName: NSApplication.didResignActiveNotification, object: app, queue: .main) { _ in
    app.terminate(nil)
}
panel.makeKeyAndOrderFront(nil)
// Float above the launcher window, which sits at level 19 (above Dock/menu bar)
panel.level = NSWindow.Level(rawValue: 20)
app.activate(ignoringOtherApps: true)
app.run()
