"""TelemetryStore SQLite behavior."""

from __future__ import annotations

from pathlib import Path

import pytest

from vettrack_cleaner.storage.telemetry import RunStatus, TelemetryStore


@pytest.fixture
def store(tmp_path: Path) -> TelemetryStore:
    return TelemetryStore(tmp_path / "t.db")


def test_aggregate_increments_on_success(store: TelemetryStore) -> None:
    rid = store.start_run()
    store.finish_run(rid, 100, 2, RunStatus.SUCCESS, None)
    agg = store.get_aggregate()
    assert agg.lifetime_bytes_freed == 100
    assert agg.lifetime_files_removed == 2


def test_aggregate_skips_failed_run(store: TelemetryStore) -> None:
    rid = store.start_run()
    store.finish_run(rid, 50, 1, RunStatus.FAILED, "x")
    agg = store.get_aggregate()
    assert agg.lifetime_bytes_freed == 0
    assert agg.lifetime_files_removed == 0


def test_partial_still_adds_aggregate(store: TelemetryStore) -> None:
    rid = store.start_run()
    store.finish_run(rid, 10, 1, RunStatus.PARTIAL, "some errors")
    agg = store.get_aggregate()
    assert agg.lifetime_bytes_freed == 10


def test_scheduler_interval_and_due(store: TelemetryStore) -> None:
    store.set_scheduler_interval_days(7)
    store.ensure_next_due_if_missing()
    st = store.get_scheduler_state()
    assert st.interval_days == 7
    assert st.next_run_due_at is not None
    assert not store.is_due()  # first due is ~7 days out


def test_mark_scheduled_run_complete_advances_due(store: TelemetryStore) -> None:
    store.set_scheduler_interval_days(1)
    # force due now
    from datetime import datetime, timedelta, timezone

    past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    with store._conn() as conn:  # noqa: SLF001
        conn.execute("UPDATE scheduler_state SET next_run_due_at = ? WHERE id = 1", (past,))
    assert store.is_due()
    store.mark_scheduled_run_complete(interval_days=1)
    assert not store.is_due()
