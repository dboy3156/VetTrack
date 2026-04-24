"""Cross-platform user data / config paths."""

from __future__ import annotations

from pathlib import Path

from platformdirs import user_config_dir, user_data_dir

APP_NAME = "VetTrackCleaner"
APP_AUTHOR = "VetTrack"


def data_dir() -> Path:
    p = Path(user_data_dir(APP_NAME, APP_AUTHOR))
    p.mkdir(parents=True, exist_ok=True)
    return p


def config_dir() -> Path:
    p = Path(user_config_dir(APP_NAME, APP_AUTHOR))
    p.mkdir(parents=True, exist_ok=True)
    return p


def db_path() -> Path:
    return data_dir() / "cleaner.db"


def user_rules_path() -> Path:
    return config_dir() / "user_rules.json"


def bundled_resources_dir() -> Path:
    """Resources shipped next to package code, or under PyInstaller _MEIPASS."""
    import sys

    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS) / "resources"  # type: ignore[attr-defined]
    return Path(__file__).resolve().parent / "resources"
