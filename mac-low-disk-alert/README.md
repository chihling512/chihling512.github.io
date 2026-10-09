# Mac 容量不足提醒 / Mac Low Disk Space Alert

兩個小工具，幫你留意 Mac 的剩餘儲存空間。
Two small tools that keep an eye on your Mac's free disk space.

| 檔案 | 功能 |
|------|------|
| `install_low_disk_alert.sh` | 剩餘空間 ≤ 50GB 時跳出視窗，提醒你重新開機 |
| `install_disk_menubar.sh` | 在選單列常駐顯示剩餘空間，低於 50GB 時變成 ⚠️ |

兩個工具互相獨立，可以只裝其中一個，也可以都裝。

## 功能說明

### 容量不足提醒
- 每 10 分鐘檢查一次（透過 launchd 背景執行，開機後自動啟動）
- 低於門檻時跳出對話框，提供「稍後提醒」與「立即重新開機」
- 提醒過後 6 小時內不會重複打擾
- 門檻與冷卻時間可在 `~/.local/bin/low_disk_alert.sh` 開頭修改

### 選單列顯示
- 選單列顯示 `💾 123 GB`，每分鐘更新
- 點開可看實際剩餘空間、含可清除空間（Finder 顯示的數字）、總容量
- 可一鍵開啟系統設定的儲存空間頁面

## 安裝

1. 下載要安裝的 `.sh` 檔案
2. 開啟「終端機」，輸入 `bash `（後面有空格），把要安裝的 `.sh` 檔拖進視窗，按 Enter

```bash
bash install_low_disk_alert.sh
bash install_disk_menubar.sh
```

測試提醒視窗（請先存檔，按「立即重新開機」會真的重開機）：

```bash
bash ~/.local/bin/low_disk_alert.sh test
```

## 解除安裝

在安裝指令後面加上 `uninstall`：

```bash
bash install_low_disk_alert.sh uninstall
bash install_disk_menubar.sh uninstall
```

## 系統需求

- macOS
- 選單列顯示需要 Xcode Command Line Tools（用來編譯 Swift）。沒有的話腳本會自動請求安裝。
- 如果編譯時出現 SDK 與編譯器版本不符的錯誤，腳本會自動改用較舊的 SDK 重試。若仍失敗，可嘗試執行 `sudo rm -rf /Library/Developer/CommandLineTools` 後重新執行 `xcode-select --install`。

## 注意事項

- 第一次使用時，macOS 可能會詢問是否允許終端機控制「System Events」，請選擇允許。
- 程式顯示的是實際剩餘空間，不含 macOS 可自動清除的空間，因此數字可能比 Finder 顯示的略小。
- 重新開機能清除暫存與虛擬記憶體交換檔，但若空間是被大型檔案佔滿，仍需手動清理。

## English summary

- `install_low_disk_alert.sh` installs a launchd agent that checks free space every 10 minutes and shows a dialog offering to restart when free space drops to 50 GB or below.
- `install_disk_menubar.sh` compiles and installs a small Swift menu bar app showing free disk space.
- Both scripts accept `uninstall` as an argument. Thresholds can be edited at the top of the installed scripts or Swift source.

## License

MIT
