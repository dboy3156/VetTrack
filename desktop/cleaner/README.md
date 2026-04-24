# VetTrack Cleaner (desktop)

PyQt6 system-tray app that reclaims disk space from **old temp files** (built-in rules) and optional **JSON user rules**. Telemetry (lifetime bytes/files reclaimed) is stored locally in SQLite.

## Run from source

```bash
cd desktop/cleaner
python -m pip install -e .
python -m vettrack_cleaner
```

Or: `vettrack-cleaner` (console script).

## Dev / tests

```bash
cd desktop/cleaner
python -m pip install -e ".[dev]"
pytest
```

Uses `QT_QPA_PLATFORM=offscreen` in tests (see `tests/conftest.py`).

## User rules

Default config file: OS-specific config dir + `user_rules.json` (see **Settings**). Format:

```json
[
  {"path": "~/Downloads/old-cache", "min_age_days": 30}
]
```

## Releases

Tag with `cleaner-v1.0.0` to run `.github/workflows/desktop-cleaner-release.yml`: tests on Ubuntu, then PyInstaller builds on Windows, macOS, and Linux, with GitHub Release assets.

## Manual QA checklist

1. Launch app: main window opens, Material theme (light/dark) applies.
2. **Settings**: change theme → entire UI restyles; change language to Hebrew → RTL + translated strings; interval days persists after restart.
3. **Preview scan**: dry-run message shows bytes/file count without deleting.
4. **Run cleanup**: table and lifetime totals update; success or partial warning if some files locked.
5. **Tray** (if OS supports it): icon visible; Open dashboard / Run cleaner / Preferences / Quit; closing main window hides to tray (does not exit).
6. **Scheduled run**: set `next_run_due_at` in the past via DB or wait for interval; verify background run and tray notification (optional).
7. **Build**: `pyinstaller vettrack_cleaner.spec` from `desktop/cleaner`; run produced binary; tray icon loads from bundled `resources/icons/tray.png`.

## Packaging note

PyInstaller one-file builds may trigger antivirus false positives on Windows; code signing reduces that risk for production.
