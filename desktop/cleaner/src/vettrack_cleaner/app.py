"""Application bootstrap: QApplication, theme, tray, main window."""

from __future__ import annotations

import sys

from PyQt6.QtCore import QSettings, QThreadPool
from PyQt6.QtWidgets import QApplication, QSystemTrayIcon

from vettrack_cleaner.i18n.dict_translator import apply_language
from vettrack_cleaner.paths import db_path
from vettrack_cleaner.storage.telemetry import TelemetryStore
from vettrack_cleaner.theme import apply_theme_to_app
from vettrack_cleaner.tray import TrayController
from vettrack_cleaner.windows.main_window import MainWindow


def run() -> int:
    app = QApplication(sys.argv)
    app.setApplicationName("VetTrack Cleaner")
    app.setOrganizationName("VetTrack")

    apply_theme_to_app(app)

    settings = QSettings("VetTrack", "VetTrackCleaner")
    apply_language(app, str(settings.value("language", "en")))

    store = TelemetryStore(db_path())
    store.ensure_next_due_if_missing()

    pool = QThreadPool.globalInstance()
    tray_ok = QSystemTrayIcon.isSystemTrayAvailable()
    if tray_ok:
        app.setQuitOnLastWindowClosed(False)
    else:
        app.setQuitOnLastWindowClosed(True)

    main = MainWindow(store, pool, tray_ok)
    tray: TrayController | None = None
    if tray_ok:
        tray = TrayController(app, store, main, pool)
        app._tray_controller = tray  # type: ignore[attr-defined]
    else:
        app._tray_controller = None  # type: ignore[attr-defined]

    main.show()
    return app.exec()
