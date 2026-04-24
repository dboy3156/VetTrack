"""Load optional user-defined extra roots from JSON."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class UserRule:
    path: Path
    min_age_days: int


def load_user_rules(path: Path) -> list[UserRule]:
    if not path.is_file():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(raw, list):
        return []
    out: list[UserRule] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        p = item.get("path")
        if not isinstance(p, str) or not p.strip():
            continue
        try:
            days = int(item.get("min_age_days", 7))
        except (TypeError, ValueError):
            days = 7
        if days < 0:
            days = 0
        out.append(UserRule(path=Path(p).expanduser(), min_age_days=days))
    return out


USER_RULES_EXAMPLE = """[
  {"path": "~/Downloads/old-cache", "min_age_days": 30}
]
"""
