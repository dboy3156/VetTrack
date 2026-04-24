"""QTranslator-backed Hebrew strings."""

from __future__ import annotations

from PyQt6.QtCore import QCoreApplication
from PyQt6.QtWidgets import QApplication

from vettrack_cleaner.i18n.dict_translator import apply_language


def test_hebrew_translates_dashboard(qapp: QApplication) -> None:
    apply_language(qapp, "he")
    t = QCoreApplication.translate("main", "Dashboard")
    assert t != "Dashboard"
    assert len(t) > 0


def test_english_left_to_right(qapp: QApplication) -> None:
    from PyQt6.QtCore import Qt

    apply_language(qapp, "en")
    assert qapp.layoutDirection() == Qt.LayoutDirection.LeftToRight
