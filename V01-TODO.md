# 当前窄批次：批准正文与真实独立 Worker 冒烟（2026-09-07）

前批登记为“受管派发服务层修复候选”，不是完整 v0.1：R1 尚不支持依赖任务；R2 只保证已验证原协调者恢复；R5 仅为 Run 资源约束，不是账户费用控制。保留 f3a35212fb71f065697ce8edf4ac1f1f552038a6 与原 A/B 责任轨。

本批顺序：先堵住批准正文丢失，再用匹配 Fork CLI/候选运行时验证一个无依赖小任务的送达、工作区、真实提交、测试、完成、停止。真实独立任务通过后才开展最小可信成果验收和依赖代码落地及两轨整合；12 次正式对照不启动。

| 责任轨 | 本批范围与所有权 | 模型 |
|---|---|---|
| A / 原 rules 工作树与分支 | kernel-plan.ts 与对应测试：可选批准正文 spec，保留原文；旧 schema 仍可读取 | 原 terra/medium 会话 |
| B / 原 integration 工作树与分支 | kernel-task-contract.ts 与对应服务/配置回归；持久化正文发送，缺正文创建资源前拒绝，关闭模式原样 | 原 astra/high |
| 集成 / 原 candidate | A/B 完成后由同一标准会话集成；领域问题退原 owner | terra/medium |
| 总控 | 本看板、验收、唯一环境执行者、E0 命令与分段用量记录 | 保持原强模型 |

共享字段决策：PlanTask.spec 是显式批准的正文，不是原生可变 Task.spec 的别名。缺字段的旧计划不得悄悄发出缺正文任务；派发返回 kernel_task_body_required，补正文并重新批准后继续。既有任务体系和 Run/Dispatch 生命周期复用。

开始快照保留于实验目录 body-smoke-20260907/usage-start.json；A 恢复重置单列，结束只报告各区段本轮增量，含前批累计数不作比较。必要返修会话保留至验收。

本批源码候选已接纳：64d28fdb4834b5f104c9f64be958399f2f9ffe3c；A b0f6dcda635d99f91906d54286f55738b6c5495b、B 42c740fb1631a377c0e2d6b17e365f6b77537066 均已核对远端。生产代码仅两个模块，保留上批全部测试。对应 4 文件逐个发现/执行 239 项通过；最后 helper 返修后 69 项再验通过，发现列表完全相同，111 处断言调用保留。原三类型通过；最后测试 helper 修改后 Node 类型另验通过；CLI、main、preload、renderer 构建通过，最后仅测试文件变化，不重复构建。B 三文件静态通过，原 Plan 两文件基线和本批同为 18 项既有静态诊断，保留未通过状态。详见 [实际用户流程与边界](docs/ORCA-INTEGRATION.md)。

本批 4 项 Task、5 条实际 Dispatch；没有新增模型会话，A 恢复同一 session 一次、新增承载终端一个。A 正文 Task 的 readiness / dispatch_input 两条失败，标准集成 Task 的 readiness 失败均保留；B 正文与定向回归返修两条原生 succeeded。它们属于日常稳定 Orca 的源码开发，绝非候选 Kernel 真实冒烟。A Git 命令被会话交互权限挡住后取消挂起，E0 代执行已审查提交/push；标准集成 readiness 失败后未继续重复，E0 仅机械合并，后续测试领域返修仍交原 B。必要 A/B 会话显式 retain、没有代改失败状态。

### 本轮用量增量（收尾快照，不是费用）

起点为本轮用户消息 2026-09-07 18:39:57 之前最后一条 token_count；A/B 使用各会话起始快照。只展示本轮增量，不比较包含前批历史的累计数。缓存输入包含在输入内，推理输出包含在输出内。计数是客户端报告，不换算账单或节省比例。

| 执行者 / 实际模型 | 输入 | 缓存输入 | 输出 | 推理输出 | total | 区段截止（北京时间） |
|---|---:|---:|---:|---:|---:|---|
| 总控 / gpt-6-astra；本轮 effort 字段未返回 | 8,604,827 | 8,423,168 | 32,466 | 10,507 | 8,637,293 | 18:59:00 |
| B / gpt-6-astra high | 6,235,081 | 5,977,856 | 23,294 | 10,165 | 6,258,375 | 18:58:29 |
| A / gpt-5.6-terra medium，恢复后计数重置的独立区段 | 447,412 | 387,328 | 2,356 | 713 | 449,768 | 18:46:16 |

原始 usage-start.json、root-before-user.json、usage-deltas.json 位于 body-smoke-20260907。此为代码验收收尾快照，后续文档提交和最终回复不包含在计数内。

### 真实冒烟尚未执行

候选 CLI 和运行产物已准备，但 Electron 43.1.0 尚未解压安装，candidate 的 windows-native-registry 缺编译产物。已有本机缓存及同版本可复用原生模块已核实；所需准确安装动作列在接入文档，待用户按本轮安装边界批准。未运行 Docker/WSL、serve 全网卡监听、权限扩大或新增收费；CURRENT 不变。没有真实送达、工作区、提交、测试、完成和停止的全链路成功，就不启动依赖验收/代码落地或正式对照。

---

# Orca-Kernel v0.1 唯一执行看板

本看板沿用当前总控和原 A/B 轨道；A 在原任务完成后自然交接 terra 会话，B 复用原接入 Worker。从 [首批成果](https://github.com/songconmaisaix31-design/Multi-agent-kernel/tree/08d1ff6b8f2a0df4cce538213d7943508a18e5d2) 迁入。旧库仅保留历史和开发位置指针，不维护另一份活跃计划。

正式仓库：[公开 Orca Fork](https://github.com/songconmaisaix31-design/orca-kernel)。复用账号已有 Fork，父仓及 source 均为 stablyai/orca。固定起点 U=`f32ce859047a85a3ea4f507f633604dfbf596a0e`（v1.4.188）；tag 对象 `8e9d661e4f515b17a90e6916ab193367f09f42e9`，解引用与 U 一致。U 是当前开发历史的祖先，不是当前 HEAD。Fork 原 main 保留；未升级到最新 main，未改旧库可见性或历史。

## 本批交付和所有权

### 2026-09-07 开发期分级模型批次（用户方案 v1.0）

沿用受测基线 `aeedc922969be7ac1a9ac5bebf0c79a95068c567`，本节是当前增量工作，下文保留已交付证据。E0 执行已知命令/统计；E1 做冻结答案的机械任务；E2 做一般接线；E3 负责权限、依赖、并发和关键审查。保留当前总控，不改 CURRENT、认证通道或全局模型配置。

| 轨道 | 当前增量 / 互斥写权 | 模型与验收 |
|---|---|---|
| A | R4 CLI 配置/关闭入口；仅 src/cli/handlers/orchestration.ts、orchestration-run-cli.test.ts、可选 orchestration-kernel-config.ts 及相邻测试、src/cli/help.ts、src/cli/specs/orchestration.ts 及相邻 spec 测试 | 原正式 Worktree 自然交接，新会话明确 terra/medium；原 A 已完成并空闲；真实 CLI handler/parser 测试 + cli 类型检查 |
| B | 顺序修 R1/R2/R3/R5；原 Run 配置、RPC 准入/派发、DB 事务及相邻测试；必要小模块限 src/main/runtime/orchestration/kernel-*、src/main/runtime/rpc/methods/orchestration-kernel-* | 原 B 强模型会话续做；复现反例，E3 总控审查；不改 A 的 CLI/Plan 文件 |
| 总控 | 本看板、最小决策/用量记录、环境与验收 | E0 工具跑最终组合测试/类型/main 构建；最多两个写 Worker，不增常驻模型池；领域错误退 owner |

短决策：R1 在真实依赖接纳/代码落地尚无可信事实前，受管有依赖任务明确拒绝，独立任务可用；R2 仅受验证的原协调者可恢复自己切离的 Run，Worker 不可接管；R3 从持久化计划生成当前 Task 短契约并进入实际发送，关闭模式原样；R4 只接原 runUse RPC，旧服务未确认 Kernel 配置时不报启用成功；R5 在原事务内限制 Run 活跃资源与累计尝试，未释放/停止中/未知资源保守占用，失败重试消耗尝试。不新建调度/预算数据库。R5 窄审查确认 reset tasks/all 会删除累计事实，批准在原 RPC 和 db/reset/orchestration-reset.ts 的既有事务内拒绝删除受管或曾受管历史；messages 和纯原生库保持原行为。

每项只传一张任务卡和入口；完整输出留仓外日志，回传退出码/发现执行数/必要失败；原生 check --wait 后处理整批再 ACK，不逐终端刷屏。E1/E2 一次实施加一次有证据修正仍失败则诊断/升级；网络/环境/回执失败先定位，不据超时升级。Worker 不递归派发。

本批收尾纠偏：同类命令零发现不得反复试参，交 E0 使用已验证命令或准确汇总逐文件原始结果。Worker 最终报告前先处理协调消息；原生 succeeded 不替代总控验收，必要构建未过不得放行。需要返修/复用的会话先保留，完成真实验收后再决定释放，避免重复消耗恢复上下文。

能力盘点：本机 Codex 0.153.4 模型目录列出 luna、terra、sol、astra；terra 支持 medium。实际验证了 A 的 Orca requested/effective 和 Codex turn_context，均为 terra/medium；目录出现不等于其他模型已实跑。订阅周额度读取过一次，任务级费用、总控本轮独立 token 和强模型独立预算未获取，不据墙钟或 Agent 数估算，不购买额度或切付费通道。有可执行数值预算再预留约 30% 强模型资源；当前采用窄批次/有限返修约束，不让低档代签关键验收。

| 任务/提交 | 风险 | 请求模型/effort | 实际模型证据 | 升级 | 用量/未知项 | 验收 |
|---|---|---|---|---|---|---|
| A R4 / task_aa77d7575448 | 中 | gpt-5.6-terra / medium | ctx_1aaf4bfdf205 requested/effective 相同；Codex 实际 turn_context 确认 terra/medium | 0；一次定向修正 | 会话 usage 可读，任务费用未知；继承 fast 不视作低成本证明 | ef7c1f6 已核对远端；Vitest 1 文件发现/执行 21 条全过，CLI 类型检查通过；agent_prompt_stalled 回执保持 failed，同一执行者普通交接完成 |
| B R1/R2/R3/R5 / task_5bc6f1c39b34 | 高 | 原 gpt-6-astra / high | Codex /status 和 turn_context 确认；ctx_6b7bf0bcc32e 复用会话 | 0 | 11:29 刷新周额度 99%；原 7% 为 stale。周额度不是任务/强模型独立预算，旧会话 token 不可全归本批 | ea4283d 已核对远端；11 文件执行 356 条全过、原 Node 类型和 16 文件静态检查通过；原生 worker_done succeeded，release 为 retained/external_terminal、无进程操作 |
| 集成 / task_4db9201a8bfd | 中；关键放行归总控 E3 | 复用 A 的 terra / medium | ctx_2a22c88b4df0 ready/input_accepted | 0；总控独立诊断 | 与 A 共用计数区段，不拆成两份账单 | 2f70b94 已 push；12 文件逐个发现/执行 381 条全过。worker_done 虽 succeeded，但构建未过且文件超行数，总控拒收后返修 |
| 收尾 / task_57d94d2ef7a2 | 低至中；E0 检查/E2 辅助代码 | 恢复同一 terra / medium session | 新终端恢复原 session；ctx_7f7510538b6c 输入回执 failed | 0；无新模型会话 | 恢复后计数重置，单列区段 | 最终 8d7e1a7508f8f9cfe45d148f70ad6c2a5d42054d 已核对远端；66 条受影响测试、三类型、21 文件静态、main 均通过。普通源码交付，不伪造 worker_done |

R5 局部默认：maxConcurrentWorkers=2、maxAttemptsPerTask=2、maxAttempts=2×首次计划任务数；均须有限正整数，实际计数读取原 Run 记录，更新配置不清零。获准沿用 runs 增加 nullable kernel_default_max_attempts 保存首次默认值；包括旧已启用配置首次关闭，不得因换任务或 off/on 自动放大。此处是 Run 资源准入，不是跨 Run 费用上限。R2 owner 锚由已验证协调者生成并保留，不能由用户配置 JSON 冒认；旧无锚且已失去当前协调者时，只允许原生历史恰好一个协调者且与已验证调用者一致的恢复；无历史、多历史或损坏锚拒绝。

集成复用本批 A 的 terra 会话，在 R4 完成后的自然边界转到原 candidate 工作树；旧 C 已停止写入，candidate 历史快进保留。本批新增 1 个 Codex 会话；原终端释放异常后恢复同一 session，因此新增/恢复终端共 2 个，不能伪称没有恢复开销。共 4 项 Task、4 条实际 Dispatch；前置 worktree mismatch/agent_unconfigured 拒绝没有创建 Dispatch。没有为 E1 或集成另开永久模型池。

R4 的 owner/默认 limits 响应问题、R5 旧配置首次关闭及 reset 删除历史缺口均由总控独立审查定位，退原 owner 修复。最后组合文件超行数由同一 terra 精简辅助代码，保留 4 个组合用例；总控 E0 复核通过后接纳。Orca 拒绝向确认框自动答复（agent_prompt_blocked）后，取消挂起命令；总控在已有授权的 Git 环境代执行已审查的一文件 commit/普通 push，没有代写业务代码或扩大会话权限。

### 实际用量快照与本批验收

数据来自本地 Codex 会话的 token_count/total_token_usage，只提取计数字段。恢复同一 session 后实际出现计数下降，因此分区段列示；这些不是每个 Task 的费用。缓存输入是输入子集，推理输出是输出子集，不重复相加；cache_write_input_tokens 实测为 0。没有账单证据，不换算金额或声称节省百分比。

| 会话/区段（北京时间） | 输入 | 缓存输入 | 输出 | 推理输出 | 客户端 total |
|---|---:|---:|---:|---:|---:|
| B astra/high，含前批历史；截至 09-07 11:53:12 | 28,753,933 | 28,252,288 | 125,679 | 44,901 | 28,879,612 |
| A terra/medium，R4+首次集成；11:28:31–12:01:28 | 8,960,280 | 8,740,608 | 35,859 | 13,727 | 8,996,139 |
| 同一 A 恢复后区段；12:06:47–12:23:45 | 5,928,490 | 5,828,352 | 17,720 | 7,052 | 5,946,210 |

最终源码候选为 8d7e1a7508f8f9cfe45d148f70ad6c2a5d42054d，已 push，开发分支 kernel/v01-managed-dispatch 快进接纳。12 文件发现/执行 381 条全过，最后受影响文件复验 66 条全过；不把重复次数累加成新用例。pnpm run typecheck 原三项目退出 0，新增模块收录已核对；21 文件 oxfmt/oxlint 通过；main 构建退出 0、3117 modules。具体命令、逐文件数、失败记录和运行边界见 [接入验收](docs/ORCA-INTEGRATION.md)。原始 JSON/日志及用量快照保留在实验目录 tier-candidate-20260907；公开文档不包含认证或完整会话记录。

以上只用于开发，不增加实验组，不改变 CURRENT/KERNEL 正式验收；本批不启动正式实验。



### 上批已交付基线（以下提交和 275 条结果为历史记录）

上批目标已完成到服务层：validatePlan 接入真实受管派发入口，合法进入原生 workerStart，非法在执行资源创建前拒绝，关闭模式保持原生，未支持的受管低层/远端路径明确拒绝。下列 schema 30、无 CLI 的描述属于上批；本次 schema 31 和 CLI 增量以上方批次及最新验收为准。

| 轨道 | 固定工作区 / 分支 / write_paths | 已交付 |
|---|---|---|
| A 原规则 Worker | kernel-v01-rules / songconmaisaix31-design/kernel-v01-rules；src/main/runtime/orchestration/kernel-plan.ts、kernel-plan.test.ts | `7a2e4db8727ab0a8af4745a2f31a2be9219f3ffc`，已 push；实现与来源逐字节相同，121 条测试转为上游 Vitest |
| B 原接入 Worker | kernel-v01-integration / songconmaisaix31-design/kernel-v01-integration；Run types、kernel-run-config、DB schema/migrate/constants、worker-dispatch-start、dispatch-context-store、RPC orchestration-runs/workers/orchestration、orchestration-kernel-admission 及相邻测试 | `8c4f3045771e98014cf56709086b786fcb74eb0c`，已 push；13 个 B 文件，不修改 A 的 2 个文件 |
| C 唯一集成 Worker | kernel-v01-candidate / songconmaisaix31-design/kernel-v01-candidate；只做合并和验收，领域问题退原 owner | `0c4286d722342d0a2155a1e6d2e7c5637c94f61a`，依次合并 A/B、复验并 push；没有业务胶水改动 |
| 当前总控 | kernel/v01-managed-dispatch；本看板、来源和验收记录；唯一环境执行者 | 快进接纳受测候选，更新交付记录并普通 push；不写业务代码 |

同轨开发、测试、返修仍由原 Worker 负责。A/B 旧终端保留原会话，实际工作目录显式指向正式 Fork 的独立 Worktree。C 的两次原生派发回执因 agent_prompt_stalled 保持 failed；同一个 C 通过普通 CLI 交接完成源码复验，没有伪造生命周期成功，也没有重复创建集成者。

共享契约仍归 A：Plan schemaVersion/objective/nonGoals/baseCommit/tasks，任务 key/owner/writePaths/dependsOn/acceptance/escalateWhen。B 绑定 task.key=本 Run 真实 Task ID，并核对原生 Task 依赖。Run 的可空 kernel_config 持久化 {repoId,plan}；数据库从 schema 29 加性迁移至 30。

当前协调者通过真实 `orchestration.runUse` RPC 的可选 kernel 配置：省略不修改，显式 null 关闭；活跃派发、未知运行状态或未释放终端资源存在时拒绝变更。权限使用原生调用者证明和当前协调者校验，损坏/未知配置不能降级为原生。仅支持本地 Git new-top-level；其他受管路径明确拒绝。异步准备后和原生 DB 事务内再次核对，避免配置/任务变化漏管。

## 上批验收证据（保留历史）

完整复现命令、逐套数量、入口及限制见 [接入与服务层验收](docs/ORCA-INTEGRATION.md)。受测源码候选为 C 提交；最后的看板/验收提交只改文档，源码与受测候选一致。

- 上游 Vitest 配置实际发现 9 文件、275 条，实际执行 275 条全部通过，0 失败、0 跳过；其中 A 121 条、配置/DB 新测试 18 条、真实 RPC handler 新测试 36 条，其余 100 条为所选原生回归。
- `pnpm run typecheck` 使用原脚本检查 node、tc.cli、tc.web 三项目，退出 0；同一 Node 配置的 listFilesOnly 实测收录新增模块和测试。没有以 Node 直接执行 TypeScript 代替类型检查。
- 上游既有 main 构建目标成功，产物实际含 Kernel 函数；并非完整桌面/renderer/安装包构建。固定 U 的三项目类型检查和 main 构建也已通过。
- 真实 SQLite、注册的 RPC handler、调用者证明校验器参与测试；终端和执行资源边界替换。结果不代表真正启动了本次 Kernel Worker。
- 上游 LICENSE、package.json、pnpm-lock.yaml、pnpm-workspace.yaml、.npmrc 和 config 未改。只迁移必要实现/测试/研究与看板；公开差异检查未发现认证、token、完整记忆或私有业务数据。
- main 首轮构建因稀疏工作树缺少上游资源失败；唯一环境执行者从固定 U 补齐原资源后重跑，未改代码或构建配置。
- C 首次 Vitest list 的可选参数误吞测试路径，已保存误输出、从受测 HEAD 恢复该文件、修正命令后完整重跑；失败记录保留，最终源码没有测试改写。

环境为实验目录的 Node 24.16.0、pnpm 10.24.0、Vitest 4.1.5、TypeScript 7.0.2；依赖使用 frozen-lockfile + ignore-scripts，Worktree 各自独立 node_modules。Electron npm 包仍可能在 require 时隐式安装：B 早期测试触发过一次安装尝试并失败，已停止；后续 Vitest/main 构建统一采用仅当前进程的 ELECTRON_OVERRIDE_DIST_PATH 指向不存在的测试路径，阻止该隐式安装。没有启动 Electron GUI 或真实 Worker，没有全局改环境或安装项目调度系统。

## 关卡及真实剩余

| 关卡 | 当前状态 |
|---|---|
| G00 现状保护 | 历史、未提交工作、执行者及远端已核实并保留；不据此替其他关卡放行 |
| G01 Fork/U | 公开 Fork 已复用，U/tag/祖先实测一致；CURRENT 精确复现仍未完成 |
| G02 上游技术冒烟 | 所选测试、三项目类型检查、main 构建通过；真实 Worker 冒烟未通过 |
| G03 隔离 | 未通过；Docker sandbox EPERM、专用 WSL 共享挂载两条失败路线停止重试 |
| G04 CURRENT | 正式复现和实验规格验收未完成 |
| G05 契约/开关 | 规则迁移、类型检查、持久化开关和权限服务层测试通过 |
| G06 派发/交接/停止 | 本批受管派发服务测试通过；真实 Worker/结果/停止未验收 |
| G07 验收/整合 | 本批源码候选已合并复验；产品层 accepted/merged 和依赖候选进入起点未实现 |
| G08 回归闭环 | 所选回归已过，完整闭环未完成 |
| G09 两组实验 | 12 次未执行 |
| G10 交付决定 | 尚未到完整真实 v0.1 放行条件 |

本次已新增 CLI 配置/关闭入口，未新增 UI；入口代码在 Fork 中，不代表日常 CURRENT 运行时已升级。原生 Task completed 不等于 Kernel accepted/merged，当前受管依赖任务明确拒绝。词法路径验证不是磁盘写入沙箱，不证明 symlink/junction、真实提交存在性或候选差异合规。全仓所有 Vitest、完整桌面构建、真实 Worker 和正式模型实验均未执行。服务层源码成功不能代替这些验收。

## 来源保留与持续授权

首批来源：规则 `5d2f78d9077a8a14abe20a1136e3c83a4955773c`；接入研究 `ad997b786f451a6e3fea444b52a601c8b0c6ed33`；原组合候选 `6e3c43df333630bc5b156b1873f01d0e78357c28`；旧库接手 HEAD `08d1ff6b8f2a0df4cce538213d7943508a18e5d2`。旧库指针提交 `68e84c6f22b50676ab8a964af0a7b8dbb1223fd5` 已 push，08d1ff6 仍为祖先，工作区干净；原 G00/CURRENT 正文完整保留，仅加归档说明。

CURRENT 仍为 Codex 内置提示词＋长期记忆＋提示词钩子＋Orca 1.4.188 基础设施。主对照仅 CURRENT 与 KERNEL，2 类任务×2 组×3 次=12 次；不找 Kit.zip、不增第三套 Orca 实验。上游回归冒烟不是第三比较组。

既定项目、实验目录和已有预算内的开发、测试、返修、commit、普通 push 与集成无需逐关审批。环境、认证和正式实验预算不阻塞无依赖源码；G00 未通过不冻结全项目。仅不可逆操作、提权/重启、权限扩大、新增收费/超预算及重大产品决定请求用户确认。

不建设新调度器、运行时、消息系统或工作台；不改日常 Orca/.codex/记忆，不降级 sandbox，不启动未通过隔离的模型实验。环境至多一个执行者，即总控；不重复已证实失败的 Docker/WSL 路线。后续继续沿此唯一看板和原 Worker 推进，不另建活跃规划。
