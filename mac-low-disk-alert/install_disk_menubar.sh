#!/bin/bash
# Mac 選單列剩餘容量顯示 - 安裝腳本
# 用法：bash install_disk_menubar.sh
# 解除安裝：bash install_disk_menubar.sh uninstall

set -e

BIN_DIR="$HOME/.local/bin"
SRC_DIR="$HOME/.local/src"
SRC="$SRC_DIR/DiskMenuBar.swift"
BIN="$BIN_DIR/DiskMenuBar"
LABEL="com.user.diskmenubar"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_NUM=$(id -u)

if [ "$1" = "uninstall" ]; then
  launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
  rm -f "$PLIST" "$BIN" "$SRC"
  echo "已解除安裝。"
  exit 0
fi

# 需要 swiftc（Xcode Command Line Tools）
if ! command -v swiftc >/dev/null 2>&1; then
  echo "找不到 swiftc，正在請求安裝 Xcode Command Line Tools..."
  xcode-select --install || true
  echo "安裝完成後，請再執行一次這個腳本。"
  exit 1
fi

mkdir -p "$BIN_DIR" "$SRC_DIR" "$HOME/Library/LaunchAgents"

# ---------- 1. 選單列程式原始碼 ----------
cat > "$SRC" <<'SWIFT_EOF'
import Cocoa

class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem!
    var timer: Timer?
    let thresholdGB = 50.0

    let freeItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
    let purgeableItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
    let totalItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        let menu = NSMenu()
        menu.addItem(freeItem)
        menu.addItem(purgeableItem)
        menu.addItem(totalItem)
        menu.addItem(NSMenuItem.separator())

        let refresh = NSMenuItem(title: "立即重新檢查", action: #selector(refreshNow), keyEquivalent: "r")
        refresh.target = self
        menu.addItem(refresh)

        let storage = NSMenuItem(title: "開啟儲存空間設定", action: #selector(openStorage), keyEquivalent: "")
        storage.target = self
        menu.addItem(storage)

        menu.addItem(NSMenuItem.separator())
        let quit = NSMenuItem(title: "結束", action: #selector(quitApp), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)

        statusItem.menu = menu

        update()
        timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            self?.update()
        }
    }

    func gb(_ bytes: Int64) -> Double {
        return Double(bytes) / 1_000_000_000.0
    }

    func update() {
        let url = URL(fileURLWithPath: "/")
        let keys: Set<URLResourceKey> = [
            .volumeAvailableCapacityKey,
            .volumeAvailableCapacityForImportantUsageKey,
            .volumeTotalCapacityKey
        ]
        guard let values = try? url.resourceValues(forKeys: keys) else {
            statusItem.button?.title = "💾 ?"
            return
        }

        let actualFree = Int64(values.volumeAvailableCapacity ?? 0)
        let withPurgeable = values.volumeAvailableCapacityForImportantUsage ?? actualFree
        let total = Int64(values.volumeTotalCapacity ?? 0)

        let freeGB = gb(actualFree)
        let low = freeGB <= thresholdGB

        statusItem.button?.title = String(format: "%@ %.0f GB", low ? "⚠️" : "💾", freeGB)

        freeItem.title = String(format: "實際剩餘：%.1f GB", freeGB)
        purgeableItem.title = String(format: "含可清除空間：%.1f GB（Finder 顯示）", gb(withPurgeable))
        totalItem.title = String(format: "總容量：%.0f GB", gb(total))
    }

    @objc func refreshNow() { update() }

    @objc func openStorage() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.settings.Storage") {
            NSWorkspace.shared.open(url)
        }
    }

    @objc func quitApp() { NSApplication.shared.terminate(nil) }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)   // 不顯示在 Dock
app.run()
SWIFT_EOF

# ---------- 2. 編譯 ----------
echo "編譯中..."
SDK_DIR="/Library/Developer/CommandLineTools/SDKs"
COMPILED=0

# 先用預設 SDK 試試；失敗的話，依序改用較舊的 SDK（避免編譯器與 SDK 版本不合）
if swiftc -O "$SRC" -o "$BIN" 2>/dev/null; then
  COMPILED=1
else
  for SDK in MacOSX26.5.sdk MacOSX26.sdk MacOSX15.4.sdk MacOSX15.sdk; do
    if [ -d "$SDK_DIR/$SDK" ]; then
      echo "預設 SDK 無法使用，改用 $SDK 重試..."
      if swiftc -O -sdk "$SDK_DIR/$SDK" "$SRC" -o "$BIN" 2>/dev/null; then
        COMPILED=1
        break
      fi
    fi
  done
fi

if [ "$COMPILED" -ne 1 ]; then
  echo "❌ 編譯失敗。請把下面這行指令的輸出貼給開發者："
  echo "   swiftc -O -sdk $SDK_DIR/MacOSX26.sdk $SRC -o $BIN"
  exit 1
fi

# ---------- 3. 登入時自動啟動 ----------
cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$BIN</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
PLIST_EOF

launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID_NUM" "$PLIST"

echo "✅ 安裝完成！選單列右上角會出現「💾 xxx GB」。"
echo "   剩餘空間 ≤ 50GB 時會變成「⚠️ xx GB」。"
