# Phase 2A 视觉文件索引

状态：Phase 2A awaiting visual review

## 总览

- `all_blades_silhouette.png`：2048×512，四款统一正交剪影。
- `all_blades_comparison.png`：2048×2048，统一相机、比例、光照和背景的四款俯视对比。
- `../validation/blade-silhouette-overlap.json`：六组两两剪影 IoU 和非法律证明免责声明。

## 单款输出

每款均包含 512×512 的 `top`、`perspective_45`、`side`、`silhouette`，以及 1536×1536 的 `contact_sheet`：

- `blade_storm_fang_*.png`
- `blade_iron_bastion_*.png`
- `blade_orbit_halo_*.png`
- `blade_dual_comet_*.png`

## 浏览器证据

- `preview_blade_storm_fang.png`
- `preview_blade_iron_bastion.png`
- `preview_blade_orbit_halo.png`
- `preview_blade_dual_comet.png`

浏览器量化结果见 `../validation/browser-test.json`。
