"""Background cleanup tasks (thread pool)."""

from __future__ import annotations

from pathlib import Path

from PyQt6.QtCore import QObject, QRunnable, QThreadPool, pyqtSignal

from vettrack_cleaner.core.engine import run_cleanup
from vettrack_cleaner.storage.telemetry import RunStatus, TelemetryStore


class CleanupSignals(QObject):
    finished = pyqtSignal(int, int, list)  # bytes_freed, files_removed, errors (list[str])
    failed = pyqtSignal(str)


class CleanupTask(QRunnable):
    def __init__(
        self,
        store: TelemetryStore,
        user_rules_path: Path | None,
        include_builtin: bool,
        signals: CleanupSignals,
    ) -> None:
        super().__init__()
        self._store = store
        self._user_rules_path = user_rules_path
        self._include_builtin = include_builtin
        self._signals = signals

    def run(self) -> None:
        run_id = self._store.start_run()
        try:
            result = run_cleanup(
                user_rules_path=self._user_rules_path,
                include_builtin=self._include_builtin,
            )
            err_tail = "; ".join(result.errors[:5]) if result.errors else None
            if result.errors:
                status = RunStatus.PARTIAL
                msg = err_tail if len(result.errors) <= 5 else f"{err_tail}…"
            else:
                status = RunStatus.SUCCESS
                msg = None
            self._store.finish_run(
                run_id,
                result.bytes_freed,
                result.files_removed,
                status,
                msg,
            )
            self._store.mark_scheduled_run_complete()
            self._signals.finished.emit(result.bytes_freed, result.files_removed, result.errors)
        except Exception as e:  # noqa: BLE001
            self._store.finish_run(run_id, 0, 0, RunStatus.FAILED, str(e))
            self._signals.failed.emit(str(e))


def run_cleanup_async(
    pool: QThreadPool,
    store: TelemetryStore,
    user_rules_path: Path | None,
    include_builtin: bool,
    signals: CleanupSignals,
) -> None:
    pool.start(CleanupTask(store, user_rules_path, include_builtin, signals))
