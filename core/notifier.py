"""
Desktop Notifications — cross-platform native OS notifications.

Supports:
- macOS: native via osascript (no dep required)
- Linux: notify-send (libnotify)
- Windows: PowerShell Toast (or fallback to print)
- Fallback: writes to ~/.hermes/notifications.log
"""
from __future__ import annotations

import logging
import subprocess
import sys
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


class DesktopNotifier:
    """Send native desktop notifications."""

    def __init__(self, app_name: str = "DeepSpace", enabled: bool = True):
        self.app_name = app_name
        self.enabled = enabled
        self._checked = False
        self._available = False

    def is_available(self) -> bool:
        """Check if notifications are supported on this system."""
        if self._checked:
            return self._available

        self._checked = True

        if sys.platform == "darwin":
            # macOS: osascript always available
            self._available = True
        elif sys.platform.startswith("linux"):
            try:
                subprocess.run(["which", "notify-send"], capture_output=True, check=True)
                self._available = True
            except Exception:
                self._available = False
        elif sys.platform == "win32":
            # PowerShell available on Windows 10+
            try:
                subprocess.run(["powershell", "-Command", "echo 1"], capture_output=True)
                self._available = True
            except Exception:
                self._available = False
        else:
            self._available = False

        return self._available

    def notify(
        self,
        title: str,
        body: str,
        subtitle: str = "",
        sound: bool = True,
        urgency: str = "normal",  # low, normal, critical
    ) -> bool:
        """Send a desktop notification. Returns True if sent."""
        if not self.enabled:
            return False

        if not self.is_available():
            self._fallback_notify(title, body)
            return False

        try:
            if sys.platform == "darwin":
                return self._notify_macos(title, body, subtitle, sound)
            elif sys.platform.startswith("linux"):
                return self._notify_linux(title, body, urgency)
            elif sys.platform == "win32":
                return self._notify_windows(title, body)
            else:
                self._fallback_notify(title, body)
                return False
        except Exception as e:
            logger.warning(f"Notification failed: {e}")
            self._fallback_notify(title, body)
            return False

    def _notify_macos(self, title: str, body: str, subtitle: str, sound: bool) -> bool:
        """macOS native notification via osascript."""
        title_escaped = title.replace('"', '\\"').replace('\n', ' ')
        body_escaped = body.replace('"', '\\"').replace('\n', ' ')
        subtitle_escaped = subtitle.replace('"', '\\"') if subtitle else ""

        script_parts = [f'display notification "{body_escaped}" with title "{title_escaped}"']
        if subtitle_escaped:
            script_parts.append(f'subtitle "{subtitle_escaped}"')
        if sound:
            script_parts.append('sound name "default"')

        script = " ".join(script_parts)
        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True, text=True, timeout=5,
        )
        return result.returncode == 0

    def _notify_linux(self, title: str, body: str, urgency: str) -> bool:
        """Linux notification via notify-send."""
        result = subprocess.run(
            ["notify-send", title, body, "-a", self.app_name,
             "-u", urgency],
            capture_output=True, text=True, timeout=5,
        )
        return result.returncode == 0

    def _notify_windows(self, title: str, body: str) -> bool:
        """Windows toast notification via PowerShell."""
        ps_script = f"""
        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
        $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
        $textNodes = $template.GetElementsByTagName('text')
        $textNodes.Item(0).AppendChild($template.CreateTextNode('{title}')) > $null
        $textNodes.Item(1).AppendChild($template.CreateTextNode('{body}')) > $null
        $toast = [Windows.UI.Notifications.ToastNotification]::new($template)
        [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{self.app_name}').Show($toast)
        """
        result = subprocess.run(
            ["powershell", "-Command", ps_script],
            capture_output=True, text=True, timeout=10,
        )
        return result.returncode == 0

    def _fallback_notify(self, title: str, body: str):
        """Fallback: write to log file."""
        log_path = Path.home() / ".hermes" / "notifications.log"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with open(log_path, "a") as f:
            from datetime import datetime
            f.write(f"[{datetime.now().isoformat()}] {title}: {body}\n")


# Singleton
_notifier: Optional[DesktopNotifier] = None


def get_notifier() -> DesktopNotifier:
    global _notifier
    if _notifier is None:
        _notifier = DesktopNotifier()
    return _notifier


def notify(title: str, body: str, **kwargs) -> bool:
    """Convenience: send a notification with the default notifier."""
    return get_notifier().notify(title, body, **kwargs)