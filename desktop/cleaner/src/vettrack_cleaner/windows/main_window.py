"""Main window: dashboard, settings, about."""

from __future__ import annotations

from pathlib import Path

from PyQt6.QtCore import QCoreApplication, QSettings, QThreadPool, QUrl
from PyQt6.QtGui import QCloseEvent, QDesktopServices
from PyQt6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QStackedWidget,
    QTableWidget,
    QTableWidgetItem,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from vettrack_cleaner.core.engine import scan
from vettrack_cleaner.paths import user_rules_path
from vettrack_cleaner.storage.telemetry import TelemetryStore, format_bytes
from vettrack_cleaner.workers import CleanupSignals, run_cleanup_async


def tr_main(text: str) -> str:
    return QCoreApplication.translate("main", text)


class MainWindow(QMainWindow):
    def __init__(self, store: TelemetryStore, thread_pool: QThreadPool, tray_available: bool) -> None:
        super().__init__()
        self._store = store
        self._pool = thread_pool
        self._tray = tray_available
        self._settings = QSettings("VetTrack", "VetTrackCleaner")
        self._cleanup_signals = CleanupSignals()
        self._cleanup_signals.finished.connect(self._on_cleanup_finished)
        self._cleanup_signals.failed.connect(self._on_cleanup_failed)

        self.setWindowTitle(QCoreApplication.translate("app", "VetTrack Cleaner"))

        central = QWidget()
        layout = QVBoxLayout(central)

        self._stack = QStackedWidget()
        self._dash = self._build_dashboard()
        self._settings_page = self._build_settings()
        self._about = self._build_about()
        self._stack.addWidget(self._dash)
        self._stack.addWidget(self._settings_page)
        self._stack.addWidget(self._about)
        layout.addWidget(self._stack)

        nav = QHBoxLayout()
        self._btn_dash = QPushButton(tr_main("Dashboard"))
        self._btn_settings = QPushButton(tr_main("Settings"))
        self._btn_about = QPushButton(tr_main("About"))
        self._btn_dash.clicked.connect(lambda: self._stack.setCurrentIndex(0))
        self._btn_settings.clicked.connect(lambda: self._stack.setCurrentIndex(1))
        self._btn_about.clicked.connect(lambda: self._stack.setCurrentIndex(2))
        nav.addWidget(self._btn_dash)
        nav.addWidget(self._btn_settings)
        nav.addWidget(self._btn_about)
        nav.addStretch()
        layout.addLayout(nav)

        self.setCentralWidget(central)
        self.resize(720, 520)
        self.refresh_dashboard()

    def _build_dashboard(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)

        stats = QGroupBox(tr_main("Lifetime space reclaimed"))
        sf = QFormLayout()
        self._lbl_lifetime_bytes = QLabel("—")
        self._lbl_lifetime_files = QLabel("—")
        self._lbl_last_run = QLabel("—")
        self._lbl_next_run = QLabel("—")
        sf.addRow(tr_main("Lifetime space reclaimed") + ":", self._lbl_lifetime_bytes)
        sf.addRow(tr_main("Files removed (lifetime):"), self._lbl_lifetime_files)
        sf.addRow(tr_main("Last run") + ":", self._lbl_last_run)
        sf.addRow(tr_main("Next scheduled run") + ":", self._lbl_next_run)
        stats.setLayout(sf)
        v.addWidget(stats)

        self._table = QTableWidget(0, 5)
        self._table.setHorizontalHeaderLabels(
            [tr_main("Date"), tr_main("Freed"), tr_main("Files"), tr_main("Status"), tr_main("Detail")]
        )
        v.addWidget(QLabel(tr_main("Recent runs")))
        v.addWidget(self._table, stretch=1)

        row = QHBoxLayout()
        self._btn_run = QPushButton(tr_main("Run cleanup now"))
        self._btn_preview = QPushButton(tr_main("Preview scan (dry run)"))
        self._btn_run.clicked.connect(self._run_cleanup_clicked)
        self._btn_preview.clicked.connect(self._preview_clicked)
        row.addWidget(self._btn_run)
        row.addWidget(self._btn_preview)
        v.addLayout(row)
        return w

    def _build_settings(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        form = QFormLayout()

        self._chk_builtin = QCheckBox(tr_main("Include built-in temp rules"))
        self._chk_builtin.setChecked(self._settings.value("include_builtin", True, type=bool))

        self._theme_combo = QComboBox()
        self._theme_combo.addItem(tr_main("Light"), "light")
        self._theme_combo.addItem(tr_main("Dark"), "dark")
        cur = self._settings.value("theme", "dark", type=str)
        idx = self._theme_combo.findData(cur)
        self._theme_combo.setCurrentIndex(max(0, idx))

        self._lang_combo = QComboBox()
        self._lang_combo.addItem(tr_main("English"), "en")
        self._lang_combo.addItem(tr_main("Hebrew"), "he")
        cur_lang = self._settings.value("language", "en", type=str)
        li = self._lang_combo.findData(cur_lang)
        self._lang_combo.setCurrentIndex(max(0, li))

        self._spin_interval = QSpinBox()
        self._spin_interval.setRange(1, 365)
        st = self._store.get_scheduler_state()
        self._spin_interval.setValue(st.interval_days)

        rules_default = str(user_rules_path())
        self._rules_path = QLineEdit(self._settings.value("user_rules_path", rules_default, type=str) or rules_default)
        btn_open_rules = QPushButton(tr_main("Open user rules file"))
        btn_open_rules.clicked.connect(self._open_rules_dir)

        form.addRow(self._chk_builtin)
        form.addRow(tr_main("Theme") + ":", self._theme_combo)
        form.addRow(tr_main("Language") + ":", self._lang_combo)
        form.addRow(tr_main("Cleanup interval (days):"), self._spin_interval)
        form.addRow(tr_main("User rules path:"), self._rules_path)
        form.addRow(btn_open_rules)

        v.addLayout(form)
        v.addStretch()

        self._chk_builtin.toggled.connect(self._persist_settings)
        self._theme_combo.currentIndexChanged.connect(self._on_theme_changed)
        self._lang_combo.currentIndexChanged.connect(self._on_language_changed)
        self._spin_interval.valueChanged.connect(self._on_interval_changed)
        self._rules_path.editingFinished.connect(self._persist_rules_path)
        return w

    def _build_about(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        t = QTextEdit()
        t.setReadOnly(True)
        t.setPlainText(
            tr_main(
                "VetTrack Cleaner removes old files from temp folders and optional user-defined paths. "
                "Review user rules carefully before enabling them."
            )
        )
        v.addWidget(t)
        return w

    def _persist_settings(self) -> None:
        self._settings.setValue("include_builtin", self._chk_builtin.isChecked())

    def _persist_rules_path(self) -> None:
        self._settings.setValue("user_rules_path", self._rules_path.text().strip())

    def _on_theme_changed(self) -> None:
        theme = self._theme_combo.currentData()
        if theme:
            self._settings.setValue("theme", theme)
        self._emit_theme_changed()

    def _emit_theme_changed(self) -> None:
        from vettrack_cleaner.theme import apply_theme_to_app

        app = QCoreApplication.instance()
        if app:
            apply_theme_to_app(app)

    def _on_language_changed(self) -> None:
        lang = self._lang_combo.currentData()
        if lang:
            self._settings.setValue("language", lang)
        from vettrack_cleaner.i18n.dict_translator import apply_language

        app = QCoreApplication.instance()
        if app:
            apply_language(app, str(lang))
        self._retranslate_ui()

    def _on_interval_changed(self, v: int) -> None:
        self._store.set_scheduler_interval_days(v)

    def _retranslate_ui(self) -> None:
        self.setWindowTitle(QCoreApplication.translate("app", "VetTrack Cleaner"))
        self._btn_dash.setText(tr_main("Dashboard"))
        self._btn_settings.setText(tr_main("Settings"))
        self._btn_about.setText(tr_main("About"))
        self._btn_run.setText(tr_main("Run cleanup now"))
        self._btn_preview.setText(tr_main("Preview scan (dry run)"))
        self._chk_builtin.setText(tr_main("Include built-in temp rules"))
        self._table.setHorizontalHeaderLabels(
            [tr_main("Date"), tr_main("Freed"), tr_main("Files"), tr_main("Status"), tr_main("Detail")]
        )
        # group box titles / labels need refresh
        self.refresh_dashboard()
        app = QCoreApplication.instance()
        if app:
            tc = getattr(app, "_tray_controller", None)
            if tc:
                tc.retranslate()

    def _open_rules_dir(self) -> None:
        p = Path(self._rules_path.text().strip() or user_rules_path())
        p.parent.mkdir(parents=True, exist_ok=True)
        if not p.is_file():
            try:
                p.write_text('[\n]\n', encoding="utf-8")
            except OSError:
                pass
        QDesktopServices.openUrl(QUrl.fromLocalFile(str(p.parent)))

    def refresh_dashboard(self) -> None:
        agg = self._store.get_aggregate()
        self._lbl_lifetime_bytes.setText(format_bytes(agg.lifetime_bytes_freed))
        self._lbl_lifetime_files.setText(str(agg.lifetime_files_removed))

        st = self._store.get_scheduler_state()
        if st.last_run_at:
            self._lbl_last_run.setText(st.last_run_at.strftime("%Y-%m-%d %H:%M UTC"))
        else:
            self._lbl_last_run.setText(tr_main("Never"))
        if st.next_run_due_at:
            self._lbl_next_run.setText(st.next_run_due_at.strftime("%Y-%m-%d %H:%M UTC"))
        else:
            self._lbl_next_run.setText(tr_main("Not scheduled"))

        runs = self._store.list_recent_runs(50)
        self._table.setRowCount(len(runs))
        for i, r in enumerate(runs):
            when = r.started_at.strftime("%Y-%m-%d %H:%M")
            self._table.setItem(i, 0, QTableWidgetItem(when))
            self._table.setItem(i, 1, QTableWidgetItem(format_bytes(r.bytes_freed)))
            self._table.setItem(i, 2, QTableWidgetItem(str(r.files_removed)))
            st_label = tr_main(r.status) if r.status in ("success", "failed", "partial", "running") else r.status
            self._table.setItem(i, 3, QTableWidgetItem(st_label))
            detail = r.error_message or ""
            self._table.setItem(i, 4, QTableWidgetItem(detail))
        self._table.resizeColumnsToContents()

    def _rules_file(self) -> Path:
        return Path(self._rules_path.text().strip() or user_rules_path())

    def _run_cleanup_clicked(self) -> None:
        self._persist_rules_path()
        self._btn_run.setEnabled(False)
        run_cleanup_async(
            self._pool,
            self._store,
            self._rules_file(),
            self._chk_builtin.isChecked(),
            self._cleanup_signals,
        )

    def _preview_clicked(self) -> None:
        self._persist_rules_path()
        try:
            r = scan(user_rules_path=self._rules_file(), include_builtin=self._chk_builtin.isChecked())
        except OSError as e:
            QMessageBox.warning(self, tr_main("Preview"), str(e))
            return
        QMessageBox.information(
            self,
            tr_main("Preview"),
            tr_main("Preview: {0} in {1} files would be removed.").format(format_bytes(r.bytes_reclaimable), r.files_count),
        )

    def _on_cleanup_finished(self, freed: int, nfiles: int, errors: list) -> None:
        self._btn_run.setEnabled(True)
        self.refresh_dashboard()
        if errors:
            QMessageBox.warning(
                self,
                tr_main("Cleanup"),
                tr_main("Cleanup finished with issues: freed {0} in {1} files. {2}").format(
                    format_bytes(freed), nfiles, "; ".join(errors[:3])
                ),
            )
        else:
            QMessageBox.information(
                self,
                tr_main("Cleanup"),
                tr_main("Cleanup finished: freed {0} in {1} files.").format(format_bytes(freed), nfiles),
            )

    def _on_cleanup_failed(self, msg: str) -> None:
        self._btn_run.setEnabled(True)
        QMessageBox.critical(self, tr_main("Cleanup"), tr_main("Could not start cleanup:") + f"\n{msg}")

    def closeEvent(self, event: QCloseEvent) -> None:
        if self._tray:
            event.ignore()
            self.hide()
        else:
            event.accept()
