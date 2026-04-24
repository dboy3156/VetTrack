"""qt-material theme application."""

from __future__ import annotations

from typing import TYPE_CHECKING

from PyQt6.QtCore import QSettings
from qt_material import apply_stylesheet

if TYPE_CHECKING:
    from PyQt6.QtWidgets import QApplication


def apply_theme_to_app(app: QApplication) -> None:
    settings = QSettings("VetTrack", "VetTrackCleaner")
    theme = settings.value("theme", "dark", type=str)
    if theme == "light":
        apply_stylesheet(app, theme="light_blue.xml", invert_secondary=False)
    else:
        apply_stylesheet(app, theme="dark_blue.xml", invert_secondary=True)
