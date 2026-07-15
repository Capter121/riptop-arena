"""Tests for the Phase 2B-R1 anonymous blind-review gate."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
MODULE_PATH = ROOT / "scripts" / "summarize_phase2b_r1_blind_review.py"
SPEC = importlib.util.spec_from_file_location("blind_review", MODULE_PATH)
blind_review = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(blind_review)
CONFIG = blind_review.load_json(ROOT / "reports" / "validation" / "phase2b-r1-blind-review-template.json")


def filled_rows(reviewer_count: int, failed_item: str | None = None, partial_reviewer: str | None = None) -> list[dict[str, str]]:
    rows = blind_review.template_rows(CONFIG)
    active = set(CONFIG["reviewer_slots"][:reviewer_count])
    item_by_id = {item["item_id"]: item for item in CONFIG["items"]}
    for row in rows:
        reviewer_id = row["reviewer_id"]
        if reviewer_id not in active:
            continue
        item = item_by_id[row["item_id"]]
        if partial_reviewer == reviewer_id and row["item_id"] != "DC01":
            continue
        if item["mode"] == "matching":
            row["selection"] = item["expected_selection"]
        else:
            row["response"] = "PASS"
        if reviewer_id == CONFIG["reviewer_slots"][0] and row["item_id"] == failed_item:
            if item["mode"] == "matching":
                row["selection"] = "B" if item["expected_selection"] != "B" else "A"
            else:
                row["response"] = "LOCAL_REVISION"
    return rows


class BlindReviewGateTests(unittest.TestCase):
    def test_blank_template_is_insufficient(self) -> None:
        summary = blind_review.summarize_rows(blind_review.template_rows(CONFIG), CONFIG)
        self.assertEqual("INSUFFICIENT_REVIEWERS", summary["result"])

    def test_two_complete_reviewers_are_insufficient(self) -> None:
        summary = blind_review.summarize_rows(filled_rows(2), CONFIG)
        self.assertEqual("INSUFFICIENT_REVIEWERS", summary["result"])

    def test_three_unanimous_reviewers_pass(self) -> None:
        summary = blind_review.summarize_rows(filled_rows(3), CONFIG)
        self.assertEqual("PASS", summary["result"])

    def test_three_reviewers_with_one_failure_request_changes(self) -> None:
        summary = blind_review.summarize_rows(filled_rows(3, failed_item="DC02"), CONFIG)
        self.assertEqual("CHANGES_REQUESTED", summary["result"])
        item = next(item for item in summary["items"] if item["item_id"] == "DC02")
        self.assertAlmostEqual(2 / 3, item["pass_rate"], places=6)

    def test_five_reviewers_with_one_failure_pass(self) -> None:
        summary = blind_review.summarize_rows(filled_rows(5, failed_item="AS01"), CONFIG)
        self.assertEqual("PASS", summary["result"])
        item = next(item for item in summary["items"] if item["item_id"] == "AS01")
        self.assertEqual(0.8, item["pass_rate"])

    def test_four_reviewers_with_one_failure_pass(self) -> None:
        summary = blind_review.summarize_rows(filled_rows(4, failed_item="UX01"), CONFIG)
        self.assertEqual("PASS", summary["result"])
        item = next(item for item in summary["items"] if item["item_id"] == "UX01")
        self.assertEqual(0.75, item["pass_rate"])

    def test_partial_fourth_reviewer_is_insufficient(self) -> None:
        summary = blind_review.summarize_rows(filled_rows(4, partial_reviewer="R04"), CONFIG)
        self.assertEqual("INSUFFICIENT_REVIEWERS", summary["result"])
        self.assertEqual(["R04"], summary["partial_reviewer_ids"])


if __name__ == "__main__":
    unittest.main()
