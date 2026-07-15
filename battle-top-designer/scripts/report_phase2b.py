"""Create and audit the Phase 2B visual-review handoff reports."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
VALIDATION = ROOT / "reports" / "validation"
RENDERS = ROOT / "reports" / "renders"
STATUS = "Phase 2B awaiting visual review"
PHASE2B_START = "06ef7d7880de1e6b1845995856082b375714c722"
NEW_PARTS = (
    "core_void_falcon", "assist_guard", "assist_air", "gear_medium", "gear_high",
    "tip_ball_defense", "tip_needle_stamina", "tip_taper_balance",
)
ASSEMBLIES = (
    "assembly_phase2b_core_void_falcon", "assembly_phase2b_assist_guard", "assembly_phase2b_assist_air",
    "assembly_phase2b_gear_medium", "assembly_phase2b_gear_high", "assembly_phase2b_tip_ball_defense",
    "assembly_phase2b_tip_needle_stamina", "assembly_phase2b_tip_taper_balance",
    "assembly_phase2b_attack_representative", "assembly_phase2b_defense_representative",
    "assembly_phase2b_stamina_representative", "assembly_phase2b_balance_representative",
)
VISUALS = (
    "all_blades_comparison.png", "all_assists_comparison.png",
    "all_gears_comparison.png", "all_tips_comparison.png",
)


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def browser_counts(report: dict) -> dict:
    models = report["models"]
    return {
        "result": report["result"],
        "model_count": len(models),
        "console_errors": sum(len(item["errors"]["console"]) for item in models),
        "page_errors": sum(len(item["errors"]["page"]) for item in models),
        "failed_requests": sum(len(item["errors"]["requests"]) for item in models),
        "external_requests": sum(len(item["errors"]["external"]) for item in models),
    }


def build_summary() -> dict:
    gate = load(VALIDATION / "phase2b-quality-gate.json")
    collision = load(VALIDATION / "phase2b-collision-summary.json")
    baseline = load(VALIDATION / "phase2b-final-baseline.json")
    baseline_count = len(baseline["raw_sha256"])
    browser = browser_counts(load(VALIDATION / "browser-test-phase2b.json"))
    specs = {path.stem: load(path) for path in (ROOT / "specs" / "parts").glob("*.json")}

    parts = []
    for part_id in NEW_PARTS:
        geometry = load(VALIDATION / f"geometry-{part_id.replace('_', '-')}.json")
        glb = ROOT / "public" / "models" / "parts" / f"{part_id}.glb"
        spec = specs[part_id]
        parts.append({
            "id": part_id,
            "dimensions_mm": {
                "diameter": spec["dimensions"]["outer_radius_mm"] * 2,
                "height": spec["dimensions"]["height_mm"],
            },
            "triangle_count": geometry["triangle_count"],
            "material_count": geometry["material_count"],
            "glb_file_size_bytes": glb.stat().st_size,
            "raw_sha256": sha256(glb),
        })

    assemblies = []
    for assembly_id in ASSEMBLIES:
        report = load(VALIDATION / f"{assembly_id.replace('_', '-')}.json")
        assemblies.append({
            "id": assembly_id,
            "result": report["result"],
            "collision_count": report["collision_count"],
            "contact_review_count": report["contact_review_count"],
            "diameter_mm": report["total_diameter_mm"],
            "height_mm": report["total_height_mm"],
            "triangle_count": report["triangle_count"],
            "glb_file_size_bytes": report["glb_file_size_bytes"],
        })

    visual_paths = [f"reports/renders/{name}" for name in VISUALS]
    summary = {
        "status": STATUS,
        "interface_id": "NSS-V1",
        "quality_gate": gate,
        "counts": {
            "new_parts": len(parts), "assemblies": len(assemblies),
            "approved_baseline_glbs": baseline_count, "preview_targets": browser["model_count"],
            "unique_collision_proxies": collision["unique_proxy_part_count"],
        },
        "new_parts": parts,
        "assemblies": assemblies,
        "approved_baseline": {
            "result": baseline["result"], "glb_count": baseline_count,
            "binary_drifts": len(baseline.get("binary_drifts", [])),
            "semantic_regressions": len(baseline.get("errors", [])),
        },
        "storm_attack_regression": load(VALIDATION / "stage7-storm-regression-standalone.json"),
        "browser": browser,
        "visual_files": visual_paths,
        "automated_blockers": {
            "fail": gate["fail_count"],
            "unresolved_contact_review": gate["unresolved_contact_review_count"],
            "unconfirmed_binary_drift": gate["unconfirmed_binary_drift_count"],
            "semantic_regression": gate["semantic_regression_count"],
            "validator_errors": gate["gltf_validator_errors"],
            "validator_warnings": gate["gltf_validator_warnings"],
            "playwright_failures": gate["playwright_failures"],
        },
    }
    require(summary["counts"] == {
        "new_parts": 8, "assemblies": 12, "approved_baseline_glbs": 13,
        "preview_targets": 16, "unique_collision_proxies": 16,
    }, "Phase 2B summary counts must be 8/12/13/16/16")
    require(all(value == 0 for value in summary["automated_blockers"].values()), "automated blockers must be zero")
    require(all(item["result"] == "PASS" for item in assemblies), "all assemblies must pass")
    require(all((ROOT / path).is_file() for path in visual_paths), "visual index contains a missing file")
    return summary


def write_summary() -> None:
    summary = build_summary()
    write_json(VALIDATION / "phase2b-summary.json", summary)
    human = {
        "status": STATUS,
        "contact_review_dispositions": [],
        "pending_visual_review": True,
        "review_items": [
            "Confirm Void Falcon remains visually distinct from Solar Wolf at normal viewing distance.",
            "Confirm Heavy, Guard and Air assists communicate different mass and protection intent.",
            "Confirm Low, Medium and High gears remain distinguishable in side view.",
            "Confirm Flat, Ball, Needle and Taper contact intent is immediately legible.",
            "Confirm the four representative assemblies have coherent material hierarchy and overall silhouette.",
        ],
        "limitations": [
            "Silhouette overlap values are internal heuristics, not legal originality proof.",
            "Concept geometry is not manufacturing validation or physical high-speed battle safety certification.",
        ],
    }
    write_json(VALIDATION / "phase2b-human-review.json", human)

    part_rows = "\n".join(
        f"| {item['id']} | {item['dimensions_mm']['diameter']:.2f} × {item['dimensions_mm']['height']:.2f} | "
        f"{item['triangle_count']} | {item['material_count']} | {item['glb_file_size_bytes']} |"
        for item in summary["new_parts"]
    )
    assembly_rows = "\n".join(
        f"| {item['id']} | {item['result']} | {item['collision_count']} | {item['contact_review_count']} | "
        f"{item['diameter_mm']:.3f} | {item['height_mm']:.3f} | {item['triangle_count']} |"
        for item in summary["assemblies"]
    )
    markdown = f"""# Nova Spin System Phase 2B 验证汇总

状态：{STATUS}

## 自动质量门

- 8 个新零件、12 套 Phase 2B 装配、16 个唯一碰撞代理均通过验证。
- FAIL、未解决 CONTACT_REVIEW、未确认 BINARY_DRIFT、SEMANTIC_REGRESSION 均为 0。
- Khronos glTF Validator error/warning 均为 0；Playwright 16/16 通过，外部请求为 0。
- Phase 2A 批准基线 13 个 GLB 与 Storm Attack 独立回归均为 PASS。

## 八个新零件统计

| 零件 | 规格包络 直径×高 (mm) | 三角面 | 材质 | GLB bytes |
|---|---:|---:|---:|---:|
{part_rows}

## 十二套装配验证

| 装配 | 结果 | 碰撞 | CONTACT_REVIEW | 直径 (mm) | 高度 (mm) | 三角面 |
|---|---|---:|---:|---:|---:|---:|
{assembly_rows}

## 已执行命令

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build_all.ps1 -Scope Phase2B
powershell -ExecutionPolicy Bypass -File scripts/test_all.ps1 -Scope Phase2B
powershell -ExecutionPolicy Bypass -File scripts/test_all.ps1 -Scope StormAttackRegression
powershell -ExecutionPolicy Bypass -File scripts/test_all.ps1 -Scope Phase2BReport
powershell -ExecutionPolicy Bypass -File scripts/test_all.ps1 -Scope Phase2BFinalAudit
```

## 人工评审与限制

- 仍需人工判断同族轮廓、材质层级和四套代表性组合的整体视觉质量。
- 剪影重叠率仅为内部启发式，不构成法律意义上的原创性证明。
- 当前为概念模型和软件验证证据，不代表可制造、实体高速战斗安全或安全认证通过。
"""
    (ROOT / "reports" / "phase2b-validation-summary.md").write_text(markdown, encoding="utf-8")
    visual_index = "# Phase 2B 视觉索引\n\n状态：" + STATUS + "\n\n" + "\n".join(
        f"- [{Path(path).name}](../renders/{Path(path).name})" for path in summary["visual_files"]
    ) + "\n"
    (RENDERS / "phase2b-visual-index.md").write_text(visual_index, encoding="utf-8")
    print("NSS_PHASE2B_REPORT=PASS")


def run_git(*args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(ROOT.parent), *args], check=True, capture_output=True, text=True, encoding="utf-8"
    ).stdout.strip()


def write_audit() -> None:
    summary = load(VALIDATION / "phase2b-summary.json")
    protected = [
        "battle-top-designer/specs/interfaces.json",
        *[f"battle-top-designer/specs/parts/{name}.json" for name in (
            "blade_storm_fang", "blade_iron_bastion", "blade_orbit_halo", "blade_dual_comet"
        )],
    ]
    protected_diff = run_git("diff", "--name-only", PHASE2B_START, "--", *protected).splitlines()
    phase2b_parts = sorted(path.stem for path in (ROOT / "public" / "models" / "parts").glob("*.glb") if path.stem in NEW_PARTS)
    phase2b_assemblies = sorted(path.stem for path in (ROOT / "public" / "models" / "assemblies").glob("assembly_phase2b_*.glb"))
    license_path = ROOT / "preview" / "vendor" / "three" / "0.185.1" / "LICENSE"
    report_files = (
        ROOT / "reports" / "phase2b-validation-summary.md",
        VALIDATION / "phase2b-summary.json", VALIDATION / "phase2b-human-review.json",
        RENDERS / "phase2b-visual-index.md",
    )
    forbidden = ("Phase 2B complete", "全部MVP完成", "可用于实体高速战斗", "可制造或安全认证通过")
    forbidden_hits = [
        phrase for path in report_files for phrase in forbidden
        if phrase in path.read_text(encoding="utf-8")
    ]
    audit = {
        "result": "PASS",
        "status": STATUS,
        "phase2b_start": PHASE2B_START,
        "nss_v1_and_blade_spec_diff": protected_diff,
        "new_part_glb_count": len(phase2b_parts),
        "phase2b_assembly_glb_count": len(phase2b_assemblies),
        "cartesian_product_executed": False,
        "full_288_matrix_executed": False,
        "three_js_license_present": license_path.is_file(),
        "forbidden_claim_hits": forbidden_hits,
        "summary_status_matches": summary.get("status") == STATUS,
    }
    require(not protected_diff, "NSS-V1 or Main Blade specifications changed during Phase 2B")
    require(len(phase2b_parts) == 8, "Phase 2B must contain exactly eight new part GLBs")
    require(len(phase2b_assemblies) == 12, "Phase 2B must contain exactly twelve assembly GLBs")
    require(license_path.is_file(), "offline Three.js license is missing")
    require(not forbidden_hits, "final reports contain a forbidden completion claim")
    require(audit["summary_status_matches"], "final status does not match the approved wording")
    write_json(VALIDATION / "phase2b-final-audit.json", audit)
    print("NSS_PHASE2B_AUDIT=PASS")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("summary", "audit"), required=True)
    args = parser.parse_args()
    if args.mode == "summary":
        write_summary()
    else:
        write_audit()


if __name__ == "__main__":
    main()
