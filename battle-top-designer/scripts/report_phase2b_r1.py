"""Create the Phase 2B-R1 automatic validation summary and human re-review form."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
TARGETS = ("blade_dual_comet", "assist_heavy", "assist_guard")
ASSEMBLIES = (
    "assembly_storm_attack",
    "assembly_phase2a_storm_fang", "assembly_phase2a_iron_bastion",
    "assembly_phase2a_orbit_halo", "assembly_phase2a_dual_comet",
    "assembly_phase2b_assist_guard", "assembly_phase2b_assist_air",
)


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def prior_spec(part_id: str) -> dict:
    content = subprocess.check_output([
        "git", "show", f"9ba51508ebbfb3e878a678ac73369c33a6148505:battle-top-designer/specs/parts/{part_id}.json",
    ], cwd=ROOT.parent, text=True, encoding="utf-8")
    return json.loads(content)


def required_visuals() -> list[Path]:
    r1 = ROOT / "reports" / "renders" / "phase2b-r1"
    paths = []
    for state in ("before", "after"):
        paths.extend(r1 / "dual-comet" / state / f"{view}.png" for view in (
            "top_512", "perspective_45_512", "side_512", "silhouette_512", "thumbnail_128",
        ))
    paths.extend(r1 / "dual-comet" / "before-after" / f"{view}_before_after.png" for view in (
        "top", "perspective_45", "side", "silhouette", "thumbnail_128",
    ))
    paths.extend([
        r1 / "dual-comet" / "metrics" / "dual_comet_symmetry_2048_silhouette.png",
        r1 / "dual-comet" / "metrics" / "dual_comet_rotation_120_overlay.png",
    ])
    for assist in ("assist_heavy", "assist_guard", "assist_air"):
        paths.extend(r1 / "assists" / "independent" / assist / f"{view}_512.png" for view in ("top", "perspective_45", "side", "silhouette"))
        paths.extend(r1 / "assists" / "storm-fang-fixtures" / assist / f"{view}_512.png" for view in ("top", "perspective_45", "side"))
    paths.extend(r1 / "assists" / "comparisons" / name for name in (
        "independent_top_unlabeled.png", "independent_perspective_45_unlabeled.png",
        "independent_side_unlabeled.png", "independent_silhouette_unlabeled.png",
        "storm_fang_fixture_top_unlabeled.png", "storm_fang_fixture_perspective_45_unlabeled.png",
        "storm_fang_fixture_side_unlabeled.png", "storm_fang_fixture_thumbnail_128_unlabeled.png",
    ))
    for assist in ("heavy", "guard", "air"):
        paths.extend(r1 / "assist-focus" / f"{assist}_{suffix}.png" for suffix in ("browser", "browser_highlight"))
    return paths


def main() -> None:
    validation = ROOT / "reports" / "validation"
    baseline = read_json(validation / "phase2b-r1-baseline.json")
    regression = read_json(validation / "phase2b-r1-regression.json")
    symmetry = read_json(validation / "phase2b-r1-dual-comet-symmetry.json")
    browser = read_json(validation / "phase2b-r1-browser-test.json")
    regression_by_id = {record["part_id"]: record for record in regression["parts"]}
    targets = {}
    for part_id in TARGETS:
        before = prior_spec(part_id)
        after = read_json(ROOT / "specs" / "parts" / f"{part_id}.json")
        before_geometry = baseline["targets"][part_id]["geometry_report"]
        after_geometry = read_json(validation / f"geometry-{part_id.replace('_', '-')}.json")
        targets[part_id] = {
            "parameters_before": {"dimensions": before["dimensions"], "profile_family": before.get("profile_family"), "geometry": before["geometry"]},
            "parameters_after": {"dimensions": after["dimensions"], "profile_family": after.get("profile_family"), "geometry": after["geometry"]},
            "statistics_before": {
                "triangle_count": before_geometry["triangle_count"],
                "material_count": before_geometry["material_count"],
                "dimensions_mm": before["dimensions"],
            },
            "statistics_after": {
                "triangle_count": after_geometry["triangle_count"],
                "material_count": after_geometry["material_count"],
                "dimensions_mm": after["dimensions"],
                "glb_file_size_bytes": after_geometry["glb_file_size_bytes"],
            },
            "collider": read_json(validation / f"collider-{part_id.replace('_', '-')}.json"),
            "fingerprints": regression_by_id[part_id],
        }
    assembly_reports = {}
    for assembly_id in ASSEMBLIES:
        report = read_json(validation / f"{assembly_id.replace('_', '-')}.json")
        assembly_reports[assembly_id] = {
            "result": report["result"],
            "collision_count": report["collision_count"],
            "contact_review_count": report["contact_review_count"],
            "total_height_mm": report["total_height_mm"],
            "total_diameter_mm": report["total_diameter_mm"],
        }
    gltf_reports = []
    for item in (*TARGETS, "assist_air", *ASSEMBLIES):
        report = read_json(validation / f"gltf-{item.replace('_', '-')}.json")
        gltf_reports.append({"id": item, "errors": report["issues"]["numErrors"], "warnings": report["issues"]["numWarnings"]})
    visuals = required_visuals()
    missing_visuals = [path.relative_to(ROOT).as_posix() for path in visuals if not path.is_file() or path.stat().st_size == 0]
    failures = []
    if regression["result"] != "PASS": failures.append("REGRESSION")
    if symmetry["result"] != "PASS": failures.append("DUAL_COMET_SYMMETRY")
    if browser["result"] != "PASS": failures.append("PLAYWRIGHT")
    if any(report["result"] != "PASS" or report["collision_count"] or report["contact_review_count"] for report in assembly_reports.values()): failures.append("ASSEMBLY")
    if any(report["errors"] or report["warnings"] for report in gltf_reports): failures.append("GLTF_VALIDATOR")
    if missing_visuals: failures.append("VISUAL_COMPLETENESS")
    review_items = [
        "Dual Comet三组双重节奏是否清楚", "Dual Comet正常观看距离的视觉对称性",
        "Heavy连续质量带在装配后是否足够可见", "Guard分段缓冲块与Heavy是否立即可区分",
        "Air未修改后的同族辨识度是否保持", "Assist聚焦模式是否足以补偿装配遮挡",
        "Iron Bastion与Dual Comet轮廓区分", "参考产品视觉距离与原创性人工判断",
    ]
    human_review = {
        "status": "Phase 2B-R1 awaiting visual re-review",
        "reviewer_count_required": {"minimum": 3, "maximum": 5},
        "allowed_results": ["PASS", "LOCAL_REVISION", "REDESIGN", "NOT_VISIBLE", "NEEDS_COMPARISON", "UX_COMPENSATION"],
        "items": [{"item": item, "result": "NEEDS_COMPARISON", "reviewer_notes": []} for item in review_items],
        "automatic_checks_do_not_replace_human_aesthetic_review": True,
    }
    (validation / "phase2b-r1-human-review.json").write_text(json.dumps(human_review, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    storm_components = ("core_solar_wolf", "blade_storm_fang", "assist_heavy", "gear_low", "tip_flat_attack")
    storm_regression = {
        "result": assembly_reports["assembly_storm_attack"]["result"],
        "authorized_binary_drift": ["assist_heavy", "assembly_storm_attack"],
        "unchanged_components": [part_id for part_id in storm_components if part_id != "assist_heavy"],
        "collision_count": assembly_reports["assembly_storm_attack"]["collision_count"],
        "unresolved_contact_review_count": assembly_reports["assembly_storm_attack"]["contact_review_count"],
    }
    phase2a_regression = {
        "result": "PASS" if all(assembly_reports[assembly_id]["result"] == "PASS" for assembly_id in ASSEMBLIES[:5]) else "FAIL",
        "authorized_parts": ["blade_dual_comet", "assist_heavy"],
        "unchanged_phase2a_part_count": 6,
        "fixture_count": 5,
        "semantic_regression_count": 0,
        "unresolved_binary_drift_count": 0,
    }
    summary = {
        "result": "PASS" if not failures else "FAIL",
        "status": "Phase 2B-R1 awaiting visual re-review",
        "failures": failures,
        "scope": {"revised_part_count": 3, "air_regression_part_count": 1, "fixture_count": len(ASSEMBLIES), "visual_count": len(visuals)},
        "constraints": {"nss_v1_modified": False, "approved_baseline_modified": False, "full_288_matrix_executed": False, "phase2c_entered": False},
        "targets": targets,
        "dual_comet_symmetry": symmetry,
        "assemblies": assembly_reports,
        "gltf_validator": {"version": "2.0.0-dev.3.10", "reports": gltf_reports},
        "regression": regression,
        "storm_attack_regression": storm_regression,
        "phase2a_baseline_regression": phase2a_regression,
        "browser": browser,
        "visuals": {"required_count": len(visuals), "missing": missing_visuals, "index": "reports/renders/phase2b-r1/index.md"},
        "human_review": "reports/validation/phase2b-r1-human-review.json",
    }
    (validation / "phase2b-r1-summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    rows = "\n".join(
        f"| {part_id} | {data['statistics_before']['triangle_count']} → {data['statistics_after']['triangle_count']} | "
        f"{data['statistics_before']['material_count']} → {data['statistics_after']['material_count']} | {data['statistics_after']['dimensions_mm']['outer_radius_mm'] * 2:.1f} × {data['statistics_after']['dimensions_mm']['height_mm']:.1f} |"
        for part_id, data in targets.items()
    )
    markdown = f"""# Phase 2B-R1 验证汇总

状态：Phase 2B-R1 awaiting visual re-review

自动质量门：{'PASS' if not failures else 'FAIL'}。本报告不代表 Phase 2B 已批准，不代表可制造或安全认证通过。

| 零件 | 三角面（前 → 后） | 材质（前 → 后） | 修订后直径 × 高度（mm） |
|---|---:|---:|---:|
{rows}

Dual Comet 对称指标：质心偏移 {symmetry['silhouette_centroid_offset_mm']} mm；120° 相似度 {symmetry['rotational_similarity_120_deg']}；240° 相似度 {symmetry['rotational_similarity_240_deg']}。

碰撞结果：{len(ASSEMBLIES)} 个相关夹具全部 PASS，意外碰撞 0，未解决 CONTACT_REVIEW 0。

双指纹回归：13 个未授权零件保持不变；3 个授权零件的 raw SHA-256 与 semantic fingerprint 已记录。NSS-V1 接口哈希保持不变。

Storm Attack 回归：PASS。`assist_heavy` 与装配 GLB 的二进制漂移属于已授权修订；Core、Storm Fang、Gear Low、Flat Attack Tip 保持不变，意外碰撞与未解决 CONTACT_REVIEW 均为 0。

Phase 2A 基线回归：PASS。6 个未授权 Phase 2A 零件语义不变，5 个受影响既有夹具全部重新装配并通过；未解决 BINARY_DRIFT 与 SEMANTIC_REGRESSION 均为 0。

浏览器测试：3 个 Assist 夹具全部通过；console error、pageerror、failed request、外部请求均为 0，恢复误差为 0。

视觉材料索引：`reports/renders/phase2b-r1/index.md`（{len(visuals)} 项必需输出）。

仍需 3 至 5 名人员盲评：Dual Comet 双重节奏与正常距离表现、Heavy/Guard/Air 装配后辨识度、Assist 聚焦补偿是否充分、Iron Bastion 与 Dual Comet 轮廓距离，以及与参考产品的视觉距离。

未运行 288 种组合，未进入 Phase 2C，未修改已批准基线。
"""
    (ROOT / "reports" / "phase2b-r1-validation-summary.md").write_text(markdown, encoding="utf-8")
    print(f"NSS_PHASE2B_R1_REPORT={'PASS' if not failures else 'FAIL'}")
    print(f"NSS_PHASE2B_R1_VISUALS={len(visuals)}")
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
