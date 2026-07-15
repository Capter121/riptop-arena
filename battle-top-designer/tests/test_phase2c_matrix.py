"""Tests for deterministic Phase 2C combination enumeration."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
MODULE_PATH = ROOT / "scripts" / "phase2c_matrix.py"
SPEC = importlib.util.spec_from_file_location("phase2c_matrix", MODULE_PATH)
matrix = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(matrix)


class Phase2CMatrixTests(unittest.TestCase):
    def setUp(self) -> None:
        self.combinations = matrix.enumerate_combinations()

    def test_exactly_288_unique_combinations(self) -> None:
        tuples = {
            (item["core"], item["blade"], item["assist"], item["gear"], item["tip"])
            for item in self.combinations
        }
        self.assertEqual(288, len(self.combinations))
        self.assertEqual(288, len(tuples))

    def test_ids_are_stable_and_contiguous(self) -> None:
        self.assertEqual(
            [f"nss-p2c-{index:04d}" for index in range(1, 289)],
            [item["combination_id"] for item in self.combinations],
        )

    def test_family_cardinalities_are_2_4_3_3_4(self) -> None:
        expected = {"core": 2, "blade": 4, "assist": 3, "gear": 3, "tip": 4}
        for role, count in expected.items():
            self.assertEqual(count, len({item[role] for item in self.combinations}))

    def test_stable_boundary_tuples(self) -> None:
        self.assertEqual(
            {
                "combination_id": "nss-p2c-0001",
                "core": "core_solar_wolf",
                "blade": "blade_dual_comet",
                "assist": "assist_air",
                "gear": "gear_high",
                "tip": "tip_ball_defense",
            },
            self.combinations[0],
        )
        self.assertEqual("nss-p2c-0288", self.combinations[-1]["combination_id"])

    def test_single_combination_selection(self) -> None:
        selected = matrix.select_combination("nss-p2c-0100", self.combinations)
        self.assertEqual("nss-p2c-0100", selected["combination_id"])

    def test_unknown_combination_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "UNKNOWN_COMBINATION_ID"):
            matrix.select_combination("nss-p2c-9999", self.combinations)


if __name__ == "__main__":
    unittest.main()
