"""SQLite: cleanup runs, lifetime aggregate, scheduler state."""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import StrEnum
from pathlib import Path
from typing import Generator, Iterable


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class RunStatus(StrEnum):
    SUCCESS = "success"
    FAILED = "failed"
    PARTIAL = "partial"


@dataclass
class RunRecord:
    id: int
    started_at: datetime
    finished_at: datetime | None
    bytes_freed: int
    files_removed: int
    status: str
    error_message: str | None


@dataclass
class Aggregate:
    lifetime_bytes_freed: int
    lifetime_files_removed: int
    updated_at: datetime


@dataclass
class SchedulerState:
    last_run_at: datetime | None
    next_run_due_at: datetime | None
    interval_days: int


class TelemetryStore:
    def __init__(self, db_file: Path) -> None:
        self._db = db_file
        self._db.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    @contextmanager
    def _conn(self) -> Generator[sqlite3.Connection, None, None]:
        conn = sqlite3.connect(self._db, timeout=30)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _init_schema(self) -> None:
        now = _utc_now().isoformat()
        with self._conn() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    started_at TEXT NOT NULL,
                    finished_at TEXT,
                    bytes_freed INTEGER NOT NULL DEFAULT 0,
                    files_removed INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL,
                    error_message TEXT
                );
                CREATE TABLE IF NOT EXISTS aggregate (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    lifetime_bytes_freed INTEGER NOT NULL DEFAULT 0,
                    lifetime_files_removed INTEGER NOT NULL DEFAULT 0,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS scheduler_state (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    last_run_at TEXT,
                    next_run_due_at TEXT,
                    interval_days INTEGER NOT NULL DEFAULT 7
                );
                """
            )
            conn.execute(
                "INSERT OR IGNORE INTO aggregate (id, lifetime_bytes_freed, lifetime_files_removed, updated_at) "
                "VALUES (1, 0, 0, ?)",
                (now,),
            )
            conn.execute(
                "INSERT OR IGNORE INTO scheduler_state (id, last_run_at, next_run_due_at, interval_days) "
                "VALUES (1, NULL, NULL, 7)",
            )

    def start_run(self) -> int:
        with self._conn() as conn:
            cur = conn.execute(
                "INSERT INTO runs (started_at, finished_at, bytes_freed, files_removed, status, error_message) "
                "VALUES (?, NULL, 0, 0, ?, NULL)",
                (_utc_now().isoformat(), "running"),
            )
            return int(cur.lastrowid)

    def finish_run(
        self,
        run_id: int,
        bytes_freed: int,
        files_removed: int,
        status: RunStatus,
        error_message: str | None = None,
    ) -> None:
        now = _utc_now().isoformat()
        with self._conn() as conn:
            conn.execute(
                "UPDATE runs SET finished_at = ?, bytes_freed = ?, files_removed = ?, status = ?, error_message = ? "
                "WHERE id = ?",
                (now, bytes_freed, files_removed, status.value, error_message, run_id),
            )
            if status in (RunStatus.SUCCESS, RunStatus.PARTIAL):
                conn.execute(
                    "UPDATE aggregate SET lifetime_bytes_freed = lifetime_bytes_freed + ?, "
                    "lifetime_files_removed = lifetime_files_removed + ?, updated_at = ? WHERE id = 1",
                    (bytes_freed, files_removed, now),
                )

    def list_recent_runs(self, limit: int = 50) -> list[RunRecord]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT id, started_at, finished_at, bytes_freed, files_removed, status, error_message "
                "FROM runs WHERE status != 'running' ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [_row_to_run(r) for r in rows]

    def get_aggregate(self) -> Aggregate:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT lifetime_bytes_freed, lifetime_files_removed, updated_at FROM aggregate WHERE id = 1"
            ).fetchone()
        assert row is not None
        return Aggregate(
            lifetime_bytes_freed=int(row["lifetime_bytes_freed"]),
            lifetime_files_removed=int(row["lifetime_files_removed"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
        )

    def get_scheduler_state(self) -> SchedulerState:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT last_run_at, next_run_due_at, interval_days FROM scheduler_state WHERE id = 1"
            ).fetchone()
        assert row is not None
        return SchedulerState(
            last_run_at=datetime.fromisoformat(row["last_run_at"]) if row["last_run_at"] else None,
            next_run_due_at=datetime.fromisoformat(row["next_run_due_at"]) if row["next_run_due_at"] else None,
            interval_days=int(row["interval_days"]),
        )

    def set_scheduler_interval_days(self, days: int) -> None:
        if days < 1:
            days = 1
        with self._conn() as conn:
            conn.execute("UPDATE scheduler_state SET interval_days = ? WHERE id = 1", (days,))

    def mark_scheduled_run_complete(self, interval_days: int | None = None) -> None:
        """After a successful scheduled cleanup, bump next_run_due_at."""
        now = _utc_now()
        with self._conn() as conn:
            if interval_days is None:
                row = conn.execute("SELECT interval_days FROM scheduler_state WHERE id = 1").fetchone()
                interval_days = int(row["interval_days"]) if row else 7
            nxt = (now + timedelta(days=interval_days)).isoformat()
            conn.execute(
                "UPDATE scheduler_state SET last_run_at = ?, next_run_due_at = ? WHERE id = 1",
                (now.isoformat(), nxt),
            )

    def ensure_next_due_if_missing(self) -> None:
        """If next_run_due_at is null, schedule first run after interval_days (conservative)."""
        st = self.get_scheduler_state()
        if st.next_run_due_at is None:
            nxt = _utc_now() + timedelta(days=st.interval_days)
            with self._conn() as conn:
                conn.execute(
                    "UPDATE scheduler_state SET next_run_due_at = ? WHERE id = 1",
                    (nxt.isoformat(),),
                )

    def is_due(self) -> bool:
        st = self.get_scheduler_state()
        if st.next_run_due_at is None:
            return True
        return _utc_now() >= st.next_run_due_at


def _row_to_run(row: sqlite3.Row) -> RunRecord:
    return RunRecord(
        id=int(row["id"]),
        started_at=datetime.fromisoformat(row["started_at"]),
        finished_at=datetime.fromisoformat(row["finished_at"]) if row["finished_at"] else None,
        bytes_freed=int(row["bytes_freed"]),
        files_removed=int(row["files_removed"]),
        status=str(row["status"]),
        error_message=row["error_message"],
    )


def format_bytes(n: int) -> str:
    if n < 1024:
        return f"{n} B"
    for unit, thresh in (("KB", 1024), ("MB", 1024**2), ("GB", 1024**3), ("TB", 1024**4)):
        if n < thresh * 1024:
            return f"{n / thresh:.2f} {unit}"
    return f"{n / 1024**4:.2f} TB"
