"""Conservative built-in cleanup targets (user temp, age-guarded)."""

from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class BuiltinRule:
    """A directory glob root with optional max file age (mtime)."""

    root: Path
    min_age_days: int
    description: str


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def default_builtin_rules() -> list[BuiltinRule]:
    """Safe defaults: only user-writable temp areas, files older than min_age_days."""
    roots: list[Path] = []
    tmp = Path(tempfile.gettempdir())
    roots.append(tmp)
    # Windows: per-user temp often under LocalAppData\Temp
    lad = os.environ.get("LOCALAPPDATA")
    if lad:
        roots.append(Path(lad) / "Temp")
    # Unix: TMPDIR
    td = os.environ.get("TMPDIR")
    if td:
        roots.append(Path(td))

    seen: set[Path] = set()
    unique: list[Path] = []
    for r in roots:
        try:
            resolved = r.resolve()
        except OSError:
            continue
        if resolved not in seen:
            seen.add(resolved)
            unique.append(resolved)

    min_age = 3
    return [
        BuiltinRule(root=u, min_age_days=min_age, description=f"Temp files under {u} older than {min_age} days")
        for u in unique
    ]
