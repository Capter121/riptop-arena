"""Tests for the pinned Phase 2C provisional exception."""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
MODULE_PATH = ROOT / "scripts" / "validate_phase2c_waiver.py"
SPEC = importlib.util.spec_from_file_location("phase2c_waiver", MODULE_PATH)
waiver = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(waiver)


class Phase2CWaiverTests(unittest.TestCase):
    def test_project_waiver_passes(self) -> None:
        report = waiver.validate(waiver.DEFAULT_WAIVER, today=date(2026, 7, 15))
        self.assertEqual("PASS", report["result"])

    def test_altered_waiver_fails(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "waiver.csv"
            path.write_bytes(waiver.DEFAULT_WAIVER.read_bytes() + b"\n")
            report = waiver.validate(path, today=date(2026, 7, 15))
        self.assertIn("WAIVER_SHA256_MISMATCH", report["errors"])

    def test_expired_waiver_fails(self) -> None:
        report = waiver.validate(waiver.DEFAULT_WAIVER, today=date(2026, 8, 15))
        self.assertIn("WAIVER_EXPIRED", report["errors"])

    def test_missing_waiver_fails(self) -> None:
        report = waiver.validate(ROOT / "missing-waiver.csv", today=date(2026, 7, 15))
        self.assertEqual("FAIL", report["result"])
        self.assertIn("WAIVER_MISSING", report["errors"])


if __name__ == "__main__":
    unittest.main()
