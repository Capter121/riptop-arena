"""Deterministically enumerate the Phase 2C NSS part matrix."""

from __future__ import annotations

import argparse
import itertools
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
PART_DIR = ROOT / "specs" / "parts"
FAMILIES = (
    ("core", "emblem_core", 2),
    ("blade", "main_blade", 4),
    ("assist", "assist_ring", 3),
    ("gear", "height_gear", 3),
    ("tip", "performance_tip", 4),
)
EXPECTED_COMBINATION_COUNT = 288


def load_specs(part_dir: Path = PART_DIR) -> list[dict]:
    specs = [json.loads(path.read_text(encoding="utf-8")) for path in sorted(part_dir.glob("*.json"))]
    ids = [spec.get("id") for spec in specs]
    if len(specs) != 16:
        raise ValueError(f"PART_COUNT_INVALID:{len(specs)}")
    if len(ids) != len(set(ids)):
        raise ValueError("DUPLICATE_PART_ID")
    if any(spec.get("interface_id") != "NSS-V1" for spec in specs):
        raise ValueError("INTERFACE_ID_INVALID")
    return specs


def group_families(specs: list[dict]) -> dict[str, list[dict]]:
    grouped = {}
    known_types = {part_type for _role, part_type, _count in FAMILIES}
    if any(spec.get("part_type") not in known_types for spec in specs):
        raise ValueError("UNKNOWN_PART_TYPE")
    for role, part_type, expected_count in FAMILIES:
        items = sorted(
            (spec for spec in specs if spec["part_type"] == part_type),
            key=lambda spec: spec["id"],
        )
        if len(items) != expected_count:
            raise ValueError(f"FAMILY_COUNT_INVALID:{role}:{len(items)}")
        grouped[role] = items
    return grouped


def enumerate_combinations(specs: list[dict] | None = None) -> list[dict[str, str]]:
    grouped = group_families(specs or load_specs())
    roles = [role for role, _part_type, _count in FAMILIES]
    combinations = []
    for index, selected in enumerate(itertools.product(*(grouped[role] for role in roles)), start=1):
        combinations.append({
            "combination_id": f"nss-p2c-{index:04d}",
            **{role: spec["id"] for role, spec in zip(roles, selected)},
        })
    tuples = [tuple(combo[role] for role in roles) for combo in combinations]
    if len(combinations) != EXPECTED_COMBINATION_COUNT:
        raise ValueError(f"COMBINATION_COUNT_INVALID:{len(combinations)}")
    if len(tuples) != len(set(tuples)):
        raise ValueError("DUPLICATE_COMBINATION")
    expected = set(itertools.product(*(
        [spec["id"] for spec in grouped[role]]
        for role in roles
    )))
    if set(tuples) != expected:
        raise ValueError("COMBINATION_OMISSION")
    return combinations


def select_combination(combination_id: str, combinations: list[dict[str, str]] | None = None) -> dict[str, str]:
    matches = [item for item in (combinations or enumerate_combinations()) if item["combination_id"] == combination_id]
    if len(matches) != 1:
        raise ValueError(f"UNKNOWN_COMBINATION_ID:{combination_id}")
    return matches[0]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--enumerate-only", action="store_true")
    parser.add_argument("--combination-id")
    args = parser.parse_args()
    combinations = enumerate_combinations()
    if args.combination_id:
        print(json.dumps(select_combination(args.combination_id, combinations), ensure_ascii=False, sort_keys=True))
    else:
        print(f"NSS_PHASE2C_COMBINATION_COUNT={len(combinations)}")
        print(f"NSS_PHASE2C_DUPLICATE_COUNT=0")
        print(f"NSS_PHASE2C_MISSING_COUNT=0")
        print(f"NSS_PHASE2C_FIRST={combinations[0]['combination_id']}")
        print(f"NSS_PHASE2C_LAST={combinations[-1]['combination_id']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
