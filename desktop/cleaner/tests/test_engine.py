"""Cleaner engine scan/run with isolated user rules."""

from __future__ import annotations

import json
import time
from pathlib import Path


def test_scan_and_run_user_rule(tmp_path: Path) -> None:
    from vettrack_cleaner.core.engine import run_cleanup, scan

    old = tmp_path / "sub" / "a.txt"
    old.parent.mkdir(parents=True)
    old.write_text("hello")
    # make file clearly old enough
    t = time.time() - 10 * 24 * 3600
    import os

    os.utime(old, (t, t))

    rules = tmp_path / "rules.json"
    rules.write_text(json.dumps([{"path": str(tmp_path), "min_age_days": 3}]), encoding="utf-8")

    s = scan(user_rules_path=rules, include_builtin=False)
    assert s.files_count >= 1
    assert s.bytes_reclaimable >= 5

    r = run_cleanup(user_rules_path=rules, include_builtin=False)
    assert r.files_removed >= 1
    assert r.bytes_freed >= 5
    assert not old.is_file()


def test_load_user_rules_invalid_json(tmp_path: Path) -> None:
    from vettrack_cleaner.core.engine import scan

    bad = tmp_path / "bad.json"
    bad.write_text("{", encoding="utf-8")
    s = scan(user_rules_path=bad, include_builtin=False)
    assert s.files_count == 0
