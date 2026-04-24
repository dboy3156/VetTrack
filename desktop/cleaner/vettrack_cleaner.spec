# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec — run from desktop/cleaner: pyinstaller vettrack_cleaner.spec"""

from pathlib import Path

block_cipher = None
spec_dir = Path(SPECPATH)
src = spec_dir / "src"

a = Analysis(
    [str(src / "vettrack_cleaner" / "__main__.py")],
    pathex=[str(src)],
    binaries=[],
    datas=[(str(src / "vettrack_cleaner" / "resources"), "resources")],
    hiddenimports=[
        "vettrack_cleaner",
        "qt_material",
        "qt_material.resources",
        "qt_material.resources.generate",
        "PyQt6.QtSvg",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="vettrack-cleaner",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
)
