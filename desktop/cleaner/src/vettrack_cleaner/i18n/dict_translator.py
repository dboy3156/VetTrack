"""QTranslator backed by in-code string maps (no lrelease binary required)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from PyQt6.QtCore import QCoreApplication, QLocale, QTranslator

if TYPE_CHECKING:
    from PyQt6.QtWidgets import QApplication

# (context, source) -> translated
_HE: dict[tuple[str, str], str] = {
    ("app", "VetTrack Cleaner"): "מנקה VetTrack",
    ("tray", "Open dashboard"): "פתח לוח בקרה",
    ("tray", "Run cleaner now"): "הרץ ניקוי עכשיו",
    ("tray", "Preferences"): "העדפות",
    ("tray", "Quit"): "יציאה",
    ("main", "Dashboard"): "לוח בקרה",
    ("main", "Settings"): "הגדרות",
    ("main", "About"): "אודות",
    ("main", "Lifetime space reclaimed"): "שטח ששוחרר לאורך זמן",
    ("main", "Files removed (lifetime)"): "קבצים שהוסרו (מצטבר)",
    ("main", "Last run"): "הרצה אחרונה",
    ("main", "Next scheduled run"): "הרצה מתוזמנת הבאה",
    ("main", "Never"): "אף פעם",
    ("main", "Not scheduled"): "לא מתוזמן",
    ("main", "Recent runs"): "הרצות אחרונות",
    ("main", "Date"): "תאריך",
    ("main", "Freed"): "שוחרר",
    ("main", "Files"): "קבצים",
    ("main", "Status"): "סטטוס",
    ("main", "Detail"): "פרט",
    ("main", "Run cleanup now"): "הרץ ניקוי עכשיו",
    ("main", "Preview scan (dry run)"): "סריקת תצוגה (ללא מחיקה)",
    ("main", "Include built-in temp rules"): "כלול כללי temp מובנים",
    ("main", "Theme"): "ערכת נושא",
    ("main", "Light"): "בהיר",
    ("main", "Dark"): "כהה",
    ("main", "Language"): "שפה",
    ("main", "English"): "אנגלית",
    ("main", "Hebrew"): "עברית",
    ("main", "Cleanup interval (days)"): "מרווח ניקוי (ימים)",
    ("main", "Open user rules file"): "פתח קובץ כללי משתמש",
    ("main", "User rules path:"): "נתיב כללי משתמש:",
    ("main", "VetTrack Cleaner removes old files from temp folders and optional user-defined paths. "
    "Review user rules carefully before enabling them."): "מנקה VetTrack מסיר קבצים ישנים מתיקיות temp "
    "ונתיבים אופציונליים שהגדרת. בדוק את כללי המשתמש בקפידה לפני הפעלתם.",
    ("main", "About VetTrack Cleaner"): "אודות מנקה VetTrack",
    ("main", "Close"): "סגור",
    ("main", "success"): "הצלחה",
    ("main", "failed"): "נכשל",
    ("main", "partial"): "חלקי",
    ("main", "running"): "רץ",
    ("main", "Could not start cleanup:"): "לא ניתן להתחיל ניקוי:",
    ("main", "Preview"): "תצוגה מקדימה",
    ("main", "Cleanup"): "ניקוי",
    ("main", "Preview: {0} in {1} files would be removed."): "תצוגה: יוסרו {0} ב־{1} קבצים.",
    ("main", "Cleanup finished: freed {0} in {1} files."): "הניקוי הסתיים: שוחררו {0} ב־{1} קבצים.",
    ("main", "Cleanup finished with issues: freed {0} in {1} files. {2}"): "הניקוי הסתיים עם בעיות: שוחררו {0} ב־{1} קבצים. {2}",
    ("main", "Scheduled cleanup failed: {0}"): "ניקוי מתוזמן נכשל: {0}",
}


class DictTranslator(QTranslator):
    def __init__(self, mapping: dict[tuple[str, str], str]) -> None:
        super().__init__()
        self._map = mapping

    def translate(self, context: str | None, source_text: str | None, disambiguation: str | None = None, n: int = -1) -> str:  # noqa: ARG002
        if not context or not source_text:
            return ""
        hit = self._map.get((context, source_text))
        if hit is None:
            return source_text
        return hit


def apply_language(app: QApplication, lang: str) -> None:
    """lang: 'en' or 'he'. Installs or removes Hebrew translator and sets layout direction."""
    from PyQt6.QtCore import Qt

    old = getattr(app, "_he_translator", None)
    if old is not None:
        app.removeTranslator(old)
        delattr(app, "_he_translator")

    if lang.lower().startswith("he"):
        tr = DictTranslator(_HE)
        app.installTranslator(tr)
        app._he_translator = tr  # type: ignore[attr-defined]
        app.setLayoutDirection(Qt.LayoutDirection.RightToLeft)
        QLocale.setDefault(QLocale(QLocale.Language.Hebrew, QLocale.Country.Israel))
    else:
        app.setLayoutDirection(Qt.LayoutDirection.LeftToRight)
        QLocale.setDefault(QLocale(QLocale.Language.English, QLocale.Country.UnitedStates))

    # force refresh of visible UI
    QCoreApplication.sendPostedEvents()
