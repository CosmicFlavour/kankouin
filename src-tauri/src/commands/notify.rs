/// Fires a desktop notification directly via `notify-rust`, bypassing
/// `tauri-plugin-notification`'s own send path.
///
/// That plugin drops the notification's handle immediately after `show()`
/// returns — and on GNOME 46+ (Ubuntu 24.04+, Fedora 41+) that makes the
/// notification flash and vanish instantly instead of staying on screen;
/// see <https://github.com/tauri-apps/plugins-workspace/issues/2566>
/// (linking to <https://github.com/hoodie/notify-rust/issues/218> and
/// <https://gitlab.gnome.org/GNOME/libnotify/-/issues/41>). The fix
/// reported working in that thread — and used here — is to keep the
/// handle alive by blocking on `on_close()`. That blocks the calling
/// thread until the notification is dismissed or times out, so it runs on
/// a spawned thread rather than Tauri's command-dispatch thread.
///
/// Fire-and-forget by design, same as the plugin API this replaces: any
/// failure (e.g. no notification daemon running) is swallowed on the
/// background thread rather than surfaced back to the caller, since by
/// the time `show()` would fail there's no synchronous channel left to
/// report it through.
#[tauri::command]
pub fn send_desktop_notification(title: String, body: String) {
    std::thread::spawn(move || {
        if let Ok(handle) = notify_rust::Notification::new()
            .summary(&title)
            .body(&body)
            .show()
        {
            handle.on_close(|_reason| {});
        }
    });
}
