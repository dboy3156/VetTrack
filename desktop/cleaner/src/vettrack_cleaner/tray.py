"""System tray icon, menu, and weekly schedule checks."""

from __future__ import annotations

from PyQt6.QtCore import QCoreApplication, QTimer
from PyQt6.QtGui import QAction, QIcon
from PyQt6.QtWidgets import QApplication, QMenu, QSystemTrayIcon

from vettrack_cleaner.paths import bundled_resources_dir
from vettrack_cleaner.storage.telemetry import TelemetryStore, format_bytes
from vettrack_cleaner.windows.main_window import MainWindow
from vettrack_cleaner.workers import CleanupSignals, run_cleanup_async


def tr_tray(text: str) -> str:
    return QCoreApplication.translate("tray", text)


class TrayController:
    def __init__(
        self,
        app: QApplication,
        store: TelemetryStore,
        main: MainWindow,
        thread_pool,
    ) -> None:
        self._app = app
        self._store = store
        self._main = main
        self._pool = thread_pool
        self._signals = CleanupSignals()
        self._signals.finished.connect(self._on_scheduled_finished)
        self._signals.failed.connect(self._on_scheduled_failed)

        self._tray = QSystemTrayIcon(self._app)
        icon_path = bundled_resources_dir() / "icons" / "tray.png"
        if icon_path.is_file():
            self._tray.setIcon(QIcon(str(icon_path)))
        else:
            self._tray.setIcon(self._app.style().standardIcon(self._app.style().StandardPixmap.SP_ComputerIcon))

        menu = QMenu()
        act_open = QAction(tr_tray("Open dashboard"), self._main)
        act_open.triggered.connect(self._show_main)
        menu.addAction(act_open)
        act_run = QAction(tr_tray("Run cleaner now"), self._main)
        act_run.triggered.connect(self._run_from_tray)
        menu.addAction(act_run)
        act_prefs = QAction(tr_tray("Preferences"), self._main)
        act_prefs.triggered.connect(self._open_settings)
        menu.addAction(act_prefs)
        menu.addSeparator()
        act_quit = QAction(tr_tray("Quit"), self._main)
        act_quit.triggered.connect(self._quit)
        menu.addAction(act_quit)
        self._tray.setContextMenu(menu)
        self._tray.activated.connect(self._on_tray_activated)
        self._tray.show()

        self._timer = QTimer(self._main)
        self._timer.timeout.connect(self._tick_schedule)
        self._timer.start(30 * 60 * 1000)  # 30 minutes

        self._store.ensure_next_due_if_missing()
        QTimer.singleShot(2000, self._tick_schedule)

    def _show_main(self) -> None:
        self._main.showNormal()
        self._main.raise_()
        self._main.activateWindow()

    def _open_settings(self) -> None:
        self._show_main()
        self._main._stack.setCurrentIndex(1)  # noqa: SLF001

    def _on_tray_activated(self, reason: QSystemTrayIcon.ActivationReason) -> None:
        if reason == QSystemTrayIcon.ActivationReason.DoubleClick:
            self._show_main()

    def _run_from_tray(self) -> None:
        run_cleanup_async(
            self._pool,
            self._store,
            self._main._rules_file(),  # noqa: SLF001
            self._main._chk_builtin.isChecked(),  # noqa: SLF001
            self._signals,
        )

    def _tick_schedule(self) -> None:
        if not self._store.is_due():
            return
        run_cleanup_async(
            self._pool,
            self._store,
            self._main._rules_file(),  # noqa: SLF001
            self._main._chk_builtin.isChecked(),  # noqa: SLF001
            self._signals,
        )

    def _on_scheduled_finished(self, freed: int, nfiles: int, errors: list) -> None:
        self._main.refresh_dashboard()
        if errors:
            self._tray.showMessage(
                tr_tray("Run cleaner now"),
                QCoreApplication.translate("main", "Cleanup finished with issues: freed {0} in {1} files. {2}").format(
                    format_bytes(freed), nfiles, "; ".join(errors[:2])
                ),
                QSystemTrayIcon.MessageIcon.Warning,
                5000,
            )
        elif freed > 0:
            self._tray.showMessage(
                tr_tray("Run cleaner now"),
                QCoreApplication.translate("main", "Cleanup finished: freed {0} in {1} files.").format(
                    format_bytes(freed), nfiles
                ),
                QSystemTrayIcon.MessageIcon.Information,
                4000,
            )

    def _on_scheduled_failed(self, msg: str) -> None:
        self._main.refresh_dashboard()
        self._tray.showMessage(
            tr_tray("Run cleaner now"),
            QCoreApplication.translate("main", "Scheduled cleanup failed: {0}").format(msg),
            QSystemTrayIcon.MessageIcon.Critical,
            8000,
        )

    def _quit(self) -> None:
        self._app.quit()

    def retranslate(self) -> None:
        m = self._tray.contextMenu()
        if m is None:
            return
        acts = m.actions()
        if len(acts) >= 5:
            acts[0].setText(tr_tray("Open dashboard"))
            acts[1].setText(tr_tray("Run cleaner now"))
            acts[2].setText(tr_tray("Preferences"))
            acts[4].setText(tr_tray("Quit"))
