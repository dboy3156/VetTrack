"""Scan and delete files matching builtin + user rules."""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from vettrack_cleaner.core.rules_builtin import default_builtin_rules
from vettrack_cleaner.core.rules_loader import UserRule, load_user_rules


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class ScanResult:
    bytes_reclaimable: int
    files_count: int
    paths_sample: list[str]


@dataclass
class RunResult:
    bytes_freed: int
    files_removed: int
    errors: list[str]


def _file_age_ok(path: Path, min_age_days: int, now: datetime) -> bool:
    try:
        st = path.stat()
        mtime = datetime.fromtimestamp(st.st_mtime, tz=timezone.utc)
    except OSError:
        return False
    return mtime <= now - timedelta(days=min_age_days)


def _iter_files_under(root: Path) -> list[Path]:
    if not root.is_dir():
        return []
    out: list[Path] = []
    try:
        for dirpath, _dirnames, filenames in os.walk(root, topdown=True, followlinks=False):
            # skip inaccessible subtrees
            for name in filenames:
                out.append(Path(dirpath) / name)
    except (OSError, PermissionError):
        pass
    return out


def _safe_unlink(path: Path) -> tuple[bool, str | None]:
    try:
        path.unlink()
        return True, None
    except OSError as e:
        return False, str(e)


def scan(
    *,
    user_rules_path: Path | None = None,
    include_builtin: bool = True,
) -> ScanResult:
    """Dry-run: total size and count of files that would be removed."""
    now = _utc_now()
    rules: list[tuple[Path, int, str]] = []
    if include_builtin:
        for br in default_builtin_rules():
            rules.append((br.root, br.min_age_days, br.description))
    if user_rules_path:
        for ur in load_user_rules(user_rules_path):
            rules.append((ur.path, ur.min_age_days, "user"))

    total_bytes = 0
    count = 0
    sample: list[str] = []
    seen_files: set[str] = set()

    for root, min_age, _desc in rules:
        for f in _iter_files_under(root):
            key = str(f.resolve()) if f.exists() else str(f)
            if key in seen_files:
                continue
            if not f.is_file():
                continue
            if not _file_age_ok(f, min_age, now):
                continue
            try:
                sz = f.stat().st_size
            except OSError:
                continue
            seen_files.add(key)
            total_bytes += sz
            count += 1
            if len(sample) < 25:
                sample.append(str(f))

    return ScanResult(bytes_reclaimable=total_bytes, files_count=count, paths_sample=sample)


def run_cleanup(
    *,
    user_rules_path: Path | None = None,
    include_builtin: bool = True,
) -> RunResult:
    """Delete files matching rules. Best-effort; collects per-file errors."""
    now = _utc_now()
    rules: list[tuple[Path, int]] = []
    if include_builtin:
        for br in default_builtin_rules():
            rules.append((br.root, br.min_age_days))
    if user_rules_path:
        for ur in load_user_rules(user_rules_path):
            rules.append((ur.path, ur.min_age_days))

    freed = 0
    removed = 0
    errors: list[str] = []
    seen_files: set[str] = set()

    for root, min_age in rules:
        for f in _iter_files_under(root):
            try:
                key = str(f.resolve())
            except OSError:
                key = str(f)
            if key in seen_files:
                continue
            if not f.is_file():
                continue
            if not _file_age_ok(f, min_age, now):
                continue
            try:
                sz = f.stat().st_size
            except OSError:
                continue
            seen_files.add(key)
            ok, err = _safe_unlink(f)
            if ok:
                freed += sz
                removed += 1
            elif err:
                errors.append(f"{f}: {err}")

    return RunResult(bytes_freed=freed, files_removed=removed, errors=errors)
