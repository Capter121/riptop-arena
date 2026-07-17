# Stage 7 诊断 Markdown 锚点替换审计

两份诊断 Markdown 已执行字节、行级和规范化语义比较。旧字节未被提交引用，但可从最终提交版本按已记录空白差异在内存中精确重建，并分别命中旧 SHA-256。规范化仅忽略行尾空格、文件末尾空行和换行形式；文字、数字、时间线、路径、哈希、结论、状态和根因均参与比较。

| 文件 | 旧 SHA-256 | 新 SHA-256 | 字节差 | 规范化语义相等 |
| --- | --- | --- | ---: | --- |
| Tip observation diagnosis | `4a26d1b9ed577fe0280c61dcfda66c7ea84054c17dd29abd0c26706d5663a3a1` | `ec0ece363cfd094a77e60b2e6b865784afaaec87c96808303f09a2295ba1780d` | 3 | `true` |
| Collection-boundary diagnosis | `b7a112df10ab179135ec4e4994883a4aacaef07d4633e4b7d22f5f79a7916f37` | `8380edb8bb722e3f8a7aaaf8ea5988089f0361dc05e358fd4b47b270c0edef24` | 1 | `true` |

Tip 的差异是 Source trace 行尾两个空格及文件末尾一个空行；Collection-boundary 的差异是文件末尾一个空行。除此之外没有任何语义变化。

- 旧锚点记录提交：`c84a39b1f8fb129261b8af9b37f014ee943f300f`
- 当前文件来源提交：`c58c51222894cad89344476192f11c4568469ed5`
- 变更原因：`WHITESPACE_ONLY_PRECOMMIT_NORMALIZATION`
- 批准方：`PROJECT_OWNER`
