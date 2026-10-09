#!/bin/bash
# Mac 容量不足提醒 - 安裝腳本
# 用法：bash install_low_disk_alert.sh
# 解除安裝：bash install_low_disk_alert.sh uninstall

set -e

BIN_DIR="$HOME/.local/bin"
SCRIPT="$BIN_DIR/low_disk_alert.sh"
LABEL="com.user.lowdiskalert"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_NUM=$(id -u)

if [ "$1" = "uninstall" ]; then
  launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
  rm -f "$PLIST" "$SCRIPT" "$HOME/.low_disk_alert_last"
  echo "已解除安裝。"
  exit 0
fi

mkdir -p "$BIN_DIR" "$HOME/Library/LaunchAgents"

# ---------- 1. 檢查程式 ----------
cat > "$SCRIPT" <<'SCRIPT_EOF'
#!/bin/bash
# 剩餘空間低於門檻時，跳出視窗提醒重新開機

THRESHOLD_GB=50          # 剩餘空間門檻（GB）
COOLDOWN_HOURS=6         # 提醒過後，幾小時內不再重複提醒
STATE="$HOME/.low_disk_alert_last"

# 取得資料磁碟剩餘空間（GB，以 1000 為單位，與 Finder 顯示一致）
FREE_GB=$(df -k /System/Volumes/Data | awk 'NR==2 { printf "%d", $4 * 1024 / 1000000000 }')

# 測試模式：bash low_disk_alert.sh test
if [ "$1" != "test" ]; then
  [ "$FREE_GB" -gt "$THRESHOLD_GB" ] && exit 0

  # 冷卻時間內不重複提醒
  if [ -f "$STATE" ]; then
    LAST=$(stat -f %m "$STATE")
    NOW=$(date +%s)
    [ $(( NOW - LAST )) -lt $(( COOLDOWN_HOURS * 3600 )) ] && exit 0
  fi
fi

touch "$STATE"

CHOICE=$(osascript <<EOF
button returned of (display dialog "硬碟剩餘空間只剩 ${FREE_GB} GB。

重新開機可以清除暫存檔與虛擬記憶體交換檔，通常能釋放一些空間。

要現在重新開機嗎？（請先儲存手邊的工作）" with title "⚠️ 儲存空間不足" buttons {"稍後提醒", "立即重新開機"} default button "稍後提醒" with icon caution giving up after 300)
EOF
)

if [ "$CHOICE" = "立即重新開機" ]; then
  osascript -e 'tell application "System Events" to restart'
fi
SCRIPT_EOF

chmod +x "$SCRIPT"

# ---------- 2. launchd 排程（每 10 分鐘檢查一次） ----------
cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$SCRIPT</string>
  </array>
  <key>StartInterval</key>
  <integer>600</integer>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
PLIST_EOF

launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID_NUM" "$PLIST"

echo "✅ 安裝完成！每 10 分鐘會檢查一次，剩餘空間 ≤ 50GB 時提醒你。"
echo "   測試彈窗：bash $SCRIPT test"
echo "   修改門檻：編輯 $SCRIPT 開頭的 THRESHOLD_GB"
