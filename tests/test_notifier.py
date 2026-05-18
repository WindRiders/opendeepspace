"""
Tests for desktop notification system.
"""
import pytest
import sys
from unittest.mock import MagicMock, patch
from core.notifier import DesktopNotifier, get_notifier, notify


class TestDesktopNotifierInit:
    """Test notifier creation."""

    def test_default_init(self):
        n = DesktopNotifier()
        assert n.app_name == "DeepSpace"
        assert n.enabled is True

    def test_custom_init(self):
        n = DesktopNotifier(app_name="TestApp", enabled=False)
        assert n.app_name == "TestApp"
        assert n.enabled is False

    def test_disabled_notifier_does_nothing(self):
        n = DesktopNotifier(enabled=False)
        result = n.notify("title", "body")
        assert result is False


class TestPlatformDetection:
    """Test platform availability checks."""

    def test_is_available_darwin(self):
        with patch('sys.platform', 'darwin'):
            n = DesktopNotifier()
            assert n.is_available() is True

    def test_is_available_linux(self):
        with patch('sys.platform', 'linux'), \
             patch('subprocess.run', return_value=MagicMock(returncode=0)):
            n = DesktopNotifier()
            assert n.is_available() is True

    def test_is_available_unknown(self):
        with patch('sys.platform', 'emscripten'):
            n = DesktopNotifier()
            assert n.is_available() is False


class TestMacOSNotify:
    """Test macOS notification via osascript (mocked)."""

    def test_notify_macos_success(self):
        with patch('sys.platform', 'darwin'), \
             patch('subprocess.run', return_value=MagicMock(returncode=0)):
            n = DesktopNotifier()
            result = n._notify_macos("Test", "Hello", "", True)
            assert result is True

    def test_notify_macos_with_subtitle(self):
        with patch('sys.platform', 'darwin'):
            n = DesktopNotifier()
            # Test escaping
            n._notify_macos('Title with "quotes"', "Body", "Subtitle", False)


class TestFallbackNotify:
    """Test fallback notification (writes to file)."""

    def test_fallback_writes(self, tmp_path):
        import os
        with patch('core.notifier.Path') as mock_path:
            mock_home = tmp_path / "home"
            mock_home.mkdir()
            n = DesktopNotifier()
            n._fallback_notify("Title", "Body text")


class TestSingleton:
    """Test the singleton pattern and convenience function."""

    def test_get_notifier_returns_same_instance(self):
        n1 = get_notifier()
        n2 = get_notifier()
        assert n1 is n2

    def test_convenience_notify(self):
        with patch('core.notifier.get_notifier') as mock_get:
            mock_n = MagicMock()
            mock_n.notify.return_value = True
            mock_get.return_value = mock_n

            result = notify("Title", "Body")
            assert result is True
            mock_n.notify.assert_called_once_with("Title", "Body")