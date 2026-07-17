# Phase 3B 内部匿名可用性测试指南

## 范围与治理

本指南仅用于本地、匿名的内部产品原型测试。Human visual review remains pending. Development continued under a documented provisional internal-prototype decision.

测试结果不得被描述为 Phase 2B 人工视觉评审通过、最终基线批准、生产就绪、可制造或 battle safe。

## 启动

从 `web-customizer` 目录启动本地开发服务器，并在 URL 中加入 `?test=1`。合法的 `?combo=<combination_id>&test=1` 可同时恢复组合并进入测试模式。整个流程不得依赖外部网络。

## 六项任务

1. 创建一套看起来偏攻击型的组合。
2. 依次查看 Heavy、Guard、Air 三个 Assist，并完成固定选项反馈。
3. 依次查看 Low、Medium、High 三个 Gear 的侧视聚焦。
4. 依次查看 Flat、Ball、Needle、Taper 四个 Tip 的低机位聚焦。
5. 保存当前组合为收藏并恢复同一收藏。
6. 完成分享链接、二维码或 PNG 组合卡片中的任意一种本地输出。

## 数据与隐私

- 系统生成匿名 UUID，不收集姓名、邮箱、电话、IP、地理位置或自由文本。
- 数据只保存在当前浏览器的 localStorage，除非参与者主动导出 JSON。
- 导出的 JSON 仅含任务状态、耗时、组合 ID、零件 ID、固定选项和错误码。
- 测试结束后可清除本地会话；研究人员只保留参与者明确提供的匿名导出。

## 结果处理

不要替参与者补写、推断或合成人工结论。保留原始匿名 JSON，并记录应用版本、测试日期及是否完整完成。发现模型或接口问题时登记 issue；不得在 Phase 3B 中静默修改 GLB、NSS-V1、mount 或临时技术基线。
