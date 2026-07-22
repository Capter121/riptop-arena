"""Focused regression tests for deterministic in-place GLB normal repair."""

from __future__ import annotations

import unittest
from pathlib import Path

from postprocess_glb_normals import rewrite_bytes


ROOT = Path(__file__).resolve().parent.parent


class NormalBufferPostprocessorTests(unittest.TestCase):
    def test_core_rewrite_preserves_immutable_glb_content(self) -> None:
        source = (ROOT / "public" / "models" / "parts" / "core_void_falcon.glb").read_bytes()
        output, report = rewrite_bytes(source)
        repeated, _repeated_report = rewrite_bytes(source)
        self.assertEqual(len(output), len(source))
        self.assertEqual(output, source)
        self.assertEqual(output, repeated)
        self.assertTrue(report["all_changed_bytes_subset_of_normal_ranges"])
        self.assertEqual(report["changed_byte_count"], 0)


if __name__ == "__main__":
    unittest.main()
