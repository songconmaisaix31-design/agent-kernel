# Orca v1.4.188 最小接入研究

2026-09-06 · B 接入轨 · 规划基线 `14c174adf1b3dd373a83b437467d43f60f2a6073`。本文保留首批只读研究结论；来源库是独立前期成果库，当前 GitHub 实测为公开。正式开发已迁至获准复用的公开 Orca Fork，实时状态仅见 ../V01-TODO.md。A 唯一维护计划类型，本轨不另定义字段或调度器。

## 固定来源与结论

官方 [v1.4.188 目录页](https://github.com/stablyai/orca/tree/v1.4.188/src/main/runtime/orchestration) 的 `currentOid` 为 **`f32ce859047a85a3ea4f507f633604dfbf596a0e`**（下称 U）。已有限读取 raw 源码，并将 tag 与 U 的 `package.json`、`orchestration-workers.ts`、`orchestration.ts` 比较，三份字节一致。后续链接全部固定 U，不以 main 推断本版本。

**关键更正：U 没有手册引用的 `orchestration-dispatch-methods.ts`（固定 tag 请求返回 404）；低层 dispatch 在 `orchestration.ts:1587`。不存在一个已读到的、包办两条路径且早于全部资源副作用的专用 Kernel 入口。** 最小建议是在两个服务端 handler 共用准入函数，并在各自既有数据库事务内复核并占用；只拦 CLI、renderer 或最后一次发送提示词均不足。

| 上游已做 | CURRENT/Kit 已做 | 仍需补充 |
|---|---|---|
| 原生 Run/Task/Dispatch、身份绑定、监督 Worker、消息及结果、停止与资源归属 | 手册冻结的人工分工、写路径、测试与提交协议；本批未验证其机器强制能力 | 受信计划、Run 开关、全部受管入口的准入与容量检查、实际候选验收 |
| SQLite 事务、启动阶段和 mutation receipt、失败/重试身份 | 本批未定位可直接复用的可执行拦截器 | 沿这些原生事实补规则，不建新 Task/Attempt/Manifest/Hash 或完成证明系统 |

## 调用链与不可绕过的接入要求

以下 `rpc/methods/` 均指 `src/main/runtime/rpc/methods/`，`db/` 均指 `src/main/runtime/orchestration/db/`。

| 固定源码位置/函数 | 已确认的顺序与接入要求（后半为建议，尚未实现） |
|---|---|
| [`rpc/methods/orchestration-workers.ts:25–119`](https://github.com/stablyai/orca/blob/f32ce859047a85a3ea4f507f633604dfbf596a0e/src/main/runtime/rpc/methods/orchestration-workers.ts#L25)，`orchestration.workerStart` | 取当前协调者 Run、核对 Task → **第 46 行 `params.on` 提前转发** → `prepareLocalWorkerStart` → 解析工作区/终端 → `createStartingWorkerDispatch` → 创建 Worktree/终端 → readiness/setup → authority → 注入。受管路径分类须在远端分支前检查；本地资源及起点检查须在第 112 行数据库写入前完成。 |
| [`rpc/methods/orchestration-federated-worker-start.ts:25`](https://github.com/stablyai/orca/blob/f32ce859047a85a3ea4f507f633604dfbf596a0e/src/main/runtime/rpc/methods/orchestration-federated-worker-start.ts#L25)，`startFederatedWorker` | 查远端能力 → 第 99 行创建本地 starting Dispatch → 调远端启动。v0.1 若仅支持本地 Git，则受管 `--on` 在转发前明确拒绝，不能只检查本地 validation；不得改普通模式远端行为。 |
| [`rpc/methods/orchestration.ts:1587–1713`](https://github.com/stablyai/orca/blob/f32ce859047a85a3ea4f507f633604dfbf596a0e/src/main/runtime/rpc/methods/orchestration.ts#L1587)，`orchestration.dispatch` | Run/Task → `dryRun` 预览 → ready/agent/稳定身份检查 → 第 1669 行 `createDispatchContext` → capability → 可选注入。受管低层 dispatch（含无 `--inject`）不能绕过准入；首版可拒绝该非监督路径。dry-run 不产生授权或真实验收。 |
| [`db/worker-dispatch/worker-dispatch-start.ts:8`](https://github.com/stablyai/orca/blob/f32ce859047a85a3ea4f507f633604dfbf596a0e/src/main/runtime/orchestration/db/worker-dispatch/worker-dispatch-start.ts#L8)，`createStartingWorkerDispatch`；[`db/dispatch-context/dispatch-context-store.ts:42`](https://github.com/stablyai/orca/blob/f32ce859047a85a3ea4f507f633604dfbf596a0e/src/main/runtime/orchestration/db/dispatch-context/dispatch-context-store.ts#L42)，`createDispatchContext` | 前者 `BEGIN IMMEDIATE` 内写 receipt、pending dispatch、starting worker 并更新 Task；后者 `SAVEPOINT`＋条件 INSERT 保护 ready Task 和 terminal/pane 占用，**前者并不调用后者**。共用规则须在各自事务内重新核对计划版本、开关、依赖与容量，再用现有 Dispatch 记录占用；不能在 await 前数一次后就放行，也不能把上游防重复占用误称为已有 Kernel 并发配额。 |
| [`rpc/methods/orchestration-worker-start-schema.ts:11`](https://github.com/stablyai/orca/blob/f32ce859047a85a3ea4f507f633604dfbf596a0e/src/main/runtime/rpc/methods/orchestration-worker-start-schema.ts#L11)，`WorkerStartParams`；[`orchestration-worker-start-validation.ts`](https://github.com/stablyai/orca/blob/f32ce859047a85a3ea4f507f633604dfbf596a0e/src/main/runtime/rpc/methods/orchestration-worker-start-validation.ts)；[`orchestration.ts:250`](https://github.com/stablyai/orca/blob/f32ce859047a85a3ea4f507f633604dfbf596a0e/src/main/runtime/rpc/methods/orchestration.ts#L250)，`DispatchParams` | 已有 Zod 参数及创建/复用、agent/model/effort 校验；不包含 A 的计划结构。沿现有 schema 加可选输入，只接收受信存储里的已批准计划关联。`prepareLocalWorkerStart` 不覆盖远端，不承担 Git 路径、审批或依赖验收。 |

受管放行必须同时满足：真实 Run/Task 及协调者权限、批准的 A 计划、实际仓库/起点、无越界或并行写冲突、依赖已验收且代码已进入起点、容量/重试上限、setup 条件。路径词法校验不能证明磁盘大小写、symlink/junction、真实提交存在性。未覆盖的 folder/远端/terminal 复用路径明确拒绝受管启动；同轨修复只有身份与成果可证明时才复用。仅管住这两条 RPC 还不构成操作系统写入沙箱，通用终端命令或外部 Git 不应被宣称受全局拦截。

## Run 存储与开关兼容

[`types.ts:43`](https://github.com/stablyai/orca/blob/f32ce859047a85a3ea4f507f633604dfbf596a0e/src/main/runtime/orchestration/types.ts#L43) 的 `RunRow` 只有原生身份、objective、home_database、协调者及时间字段，**没有通用 metadata 或 kernel 字段**。[`orchestration-runs.ts`](https://github.com/stablyai/orca/blob/f32ce859047a85a3ea4f507f633604dfbf596a0e/src/main/runtime/rpc/methods/orchestration-runs.ts#L12) 的 `RunCreateParams` 也仅接受 objective/from。实际存储为 [`OrchestrationDbCore`](https://github.com/stablyai/orca/blob/f32ce859047a85a3ea4f507f633604dfbf596a0e/src/main/runtime/orchestration/db/orchestration-db.ts#L11) → [`sync-database.ts`](https://github.com/stablyai/orca/blob/f32ce859047a85a3ea4f507f633604dfbf596a0e/src/main/sqlite/sync-database.ts#L29) 的 `node:sqlite`。

最小建议：在现有 Run 持久化中加入可空的受管设置/批准计划关联，通过现有协调者权限入口更新；缺字段或空值走原生模式。计划正文沿用 A 的 `schemaVersion/objective/nonGoals/baseCommit/tasks` 及看板任务字段，只将逻辑 key 映射到真实 Task，Worker 可写文件和消息正文不能自授写权。具体存储字段待 A 契约整合后确定，本文不抢占类型 owner。

新库入口为 [`createCoreTablesSql`](https://github.com/stablyai/orca/blob/f32ce859047a85a3ea4f507f633604dfbf596a0e/src/main/runtime/orchestration/db/schema/create-core-tables-sql.ts#L3)；旧库由 [`migrate`](https://github.com/stablyai/orca/blob/f32ce859047a85a3ea4f507f633604dfbf596a0e/src/main/runtime/orchestration/db/schema/migrate.ts#L8) 事务迁移，U 的 [`SCHEMA_VERSION=29`](https://github.com/stablyai/orca/blob/f32ce859047a85a3ea4f507f633604dfbf596a0e/src/main/runtime/orchestration/db/contract-constants.ts#L9)。需同时覆盖新建、旧 Run、迁移失败回滚和混合版本；旧程序忽略可选字段不等于它能执行受管规则，不向不支持 Kernel 的执行端派发受管任务。缺失开关按原生处理，**已启用但损坏/未知规则版本必须拒绝，不能退回原生**。

运行中关闭须先封住新派发，再核实存活/停止中/未知资源并交接；不能仅清空字段。关闭后的普通 Run 不追加 Kernel 提示词或准入约束，也不能借新 Run/task key 重置同一受管批次预算。沿用原生状态与事务，不复制另一份运行状态机。

## 结果、停止和候选合入

- 结果复用 [`reconcileLifecycleMessage` / `reconcileWorkerDoneMessage`](https://github.com/stablyai/orca/blob/f32ce859047a85a3ea4f507f633604dfbf596a0e/src/main/runtime/orchestration/lifecycle-reconciliation.ts#L103) → [`settleWorkerReport`](https://github.com/stablyai/orca/blob/f32ce859047a85a3ea4f507f633604dfbf596a0e/src/main/runtime/orchestration/db/dispatch-context/worker-report-settlement.ts#L6)：保留精确 taskId/dispatchId、capability、归属、过期与重复回报检查。`succeeded` 会将原生 Task/Dispatch 标为 completed，结果注明 `worker_report`；**这不是 Kernel accepted 或 merged**。受管下游在准入时还须读取独立验收事实，不能仅信 ready/completed。
- 读取复用 [`orchestration.workerShow/workerRead`](https://github.com/stablyai/orca/blob/f32ce859047a85a3ea4f507f633604dfbf596a0e/src/main/runtime/rpc/methods/orchestration-worker-control.ts#L31)。停止复用 [`orchestration.workerStop`](https://github.com/stablyai/orca/blob/f32ce859047a85a3ea4f507f633604dfbf596a0e/src/main/runtime/rpc/methods/orchestration-worker-stop.ts#L15)：先 `beginWorkerStop`，核对精确进程及资源所有权，`closeTerminal` 的 `ptyKilled` 成立才结算停止，无法证明则返回 unknown；context-only 只停止 assignment，明确 `processAction: none`。不能以低层 dispatch 的 stopped 证明 Worker 进程停止。后续沿用 [`workerRetain/workerRelease`](https://github.com/stablyai/orca/blob/f32ce859047a85a3ea4f507f633604dfbf596a0e/src/main/runtime/rpc/methods/orchestration-worker-release.ts#L30)，不删 Worktree，不全局杀进程；报告完成也不自动等于资源已释放。
- **待补 G07 接纳规则**：从真实 Git 候选读取基线到提交的改动及逐提交历史，检查精确路径/目录边界、重命名前后路径、共享文件 owner；不信自述 filesModified。由批准版本的可信命令执行适用测试，将候选 SHA、依赖 SHA、命令/退出码及原始日志绑定到现有 Run/Task/Dispatch；未执行、超时、空测试和缺证据均不得通过。验收依赖必须实际进入下游起点（`git merge-base --is-ancestor` 的 0/1/错误分开处理）；各轨通过后还须测试隔离组合候选，再核对目标/候选未漂移，重复报告不重复合入，冲突退回 owner。这里只提出规则，**尚未证明任何现有原生合并入口已强制这些检查**；直接合入路径的统一封口仍须下一批源码/真实验收补齐。

## 真实脚本、ABI 与无 GUI 测试

依据 U 的 [`package.json`](https://github.com/stablyai/orca/blob/f32ce859047a85a3ea4f507f633604dfbf596a0e/package.json#L12)：Node **24**、pnpm **10.24.0**；不是手册旧 main 观察中的 pnpm 12。没有另外声明 `pretest/posttest/pretypecheck/posttypecheck/prebuild/postbuild`，但脚本字符串及 install 生命周期本身有副作用。

| 命令 | U 的实际链与边界（本批全部未执行） |
|---|---|
| `pnpm test` | `node config/scripts/ensure-native-runtime.mjs --runtime=node && vitest run --config config/vitest.config.ts`。先检查 node-pty，Windows 还检查 windows-native-registry；不匹配/缺补丁产物会 `pnpm rebuild`。这不是只读命令。 |
| `pnpm run typecheck` | `run-typecheck-projects-in-parallel.mjs` 对 node、tc.cli、tc.web 三项目运行 `tsc --noEmit`，单核时串行；不含 e2e。`typecheck:node/cli/web/e2e` 为各自配置的 `tsc --noEmit`。无 GUI 启动；不能把 noEmit 推断为没有增量缓存写入。 |
| `pnpm run build:cli` | `tsc -p config/tsconfig.cli.json --outDir out --composite false --incremental false` → `verify-cli-bin.mjs --fix-executable --fix-package-json` → `install-dev-cli.mjs`。会写 out、修执行权限和 `out/package.json`；macOS/Linux 尝试 `/usr/local/bin/orca-dev` 符号链接，Windows 跳过。脚本只打印 sudo 建议，不自行提权；仍须预先决定隔离构建中的全局别名策略，不能默默删步骤后声称完整原命令通过。 |
| `pnpm run build:desktop` / `build` | desktop 顺序：typecheck → build:relay → build:cli → build:electron-vite → verify:built-skills-cli → build:web-from-renderer；build 再执行 build:native（Windows CLI launcher、macOS helpers；Linux 此步跳过）。`build:electron-vite` 是 Node 调用 electron-vite **build**，不等同启动应用；built-skills 校验会实际执行已构建 CLI 的 list/get 及 install/update dry-run。完整构建仍有产物和上述 CLI 安装副作用。 |
| `pnpm install` / `dev` / `test:e2e` | install 的 `postinstall` 调 `rebuild-native-deps.mjs`，`prepare` 调 husky；重建脚本可能安装缺失 Electron 二进制、编译模块并以 `ELECTRON_RUN_AS_NODE` 探测。dev/start 先准备 Electron ABI 再启动应用；test:e2e 先准备 Electron ABI 再 Playwright `electron-headless`，**headless 仍是 Electron 测试，不能列为无 Electron 纯测试**。 |

证据脚本：[Node/Electron ABI 检查](https://github.com/stablyai/orca/blob/f32ce859047a85a3ea4f507f633604dfbf596a0e/config/scripts/ensure-native-runtime.mjs#L50)、[postinstall 重建](https://github.com/stablyai/orca/blob/f32ce859047a85a3ea4f507f633604dfbf596a0e/config/scripts/rebuild-native-deps.mjs)、[全局 CLI 安装](https://github.com/stablyai/orca/blob/f32ce859047a85a3ea4f507f633604dfbf596a0e/config/scripts/install-dev-cli.mjs)、[typecheck 调度](https://github.com/stablyai/orca/blob/f32ce859047a85a3ea4f507f633604dfbf596a0e/config/scripts/run-typecheck-projects-in-parallel.mjs)、[构建 CLI 校验](https://github.com/stablyai/orca/blob/f32ce859047a85a3ea4f507f633604dfbf596a0e/config/scripts/verify-skills-cli-runtime.cjs#L174)。另外，[orca.yaml](https://github.com/stablyai/orca/blob/f32ce859047a85a3ea4f507f633604dfbf596a0e/orca.yaml) 的 setup 会调用 `run-internal-dev-setup.mjs`（可执行 `ORCA_INTERNAL_DEV_SETUP` 指向的程序）及 pnpm install；[orca-dev.mjs](https://github.com/stablyai/orca/blob/f32ce859047a85a3ea4f507f633604dfbf596a0e/config/scripts/orca-dev.mjs#L30) 即使查询也先生成 checkout `out/bin` 与 profile `cli/bin` 包装。同一依赖目录的 Node/Electron ABI 切换及同一 checkout 不同 profile 包装写入必须串行。

**纯测试可以不启动 GUI，也不需要启动 Orca runtime。** [`config/vitest.config.ts`](https://github.com/stablyai/orca/blob/f32ce859047a85a3ea4f507f633604dfbf596a0e/config/vitest.config.ts#L15) 默认 `environment: node`，可在已获准且依赖就绪的隔离 checkout 用 `pnpm exec vitest run --config config/vitest.config.ts <精确纯测试文件>`；这会绕开 `pnpm test` 的 ABI 前置，故只适用于已确认不依赖原生模块的纯规则测试，不能记为完整 test 命令通过。迁入 U 时注意默认 include 是 `src/**/*.test.ts` 等，**不包含本规划库 A 的 `tests/kernel/plan.test.ts`**，且 A 当前使用 Node test runner；需要沿 U Vitest 编写/迁移对应测试并核实发现数量，不能直接照搬命令宣称跑到了测试。

## 本批验证与剩余项

- 已做：读取看板、相关 G05–G07 要求和 U 工程约束；固定版本源码定位；三份关键文件 tag/U 字节一致；唯一文档的 Git diff 空白检查。参考源只暂存在 仓库外固定版本参考目录，未克隆完整历史、安装依赖、运行源码脚本、启动实验 Electron、改环境配置或重复下载发行包。
- 来源限制：GitHub tree API 返回 403 限流；`git ls-remote` 未返回后已终止。U 以官方 tag HTML 的 currentOid 和固定 SHA 文件一致性核实，不把失败查询写成成功；源码阅读与命令链分析不等于运行测试。
- 待补：受管入口/事务/Run 迁移实现及普通模式回归、真正不可绕过的候选合入门、真实 Worker 启动/结果/停止与依赖起点验收、完整上游测试/类型检查/构建。该研究时点 Fork 尚待确定；现已复用公开 Fork，安全环境、认证和正式实验预算仍由总控处理；CURRENT/KERNEL 12 次未执行，G05 及后续关卡不因本文变绿。
- 交接：本轨提交后普通 push，并交完整 SHA、远端匹配和 clean status；后续接入及返修仍由同一 Worker 承担。本文未请求或执行公开 Fork、发布、模型调用或任何新的 Agent 派发。

## 迁移来源（2026-09-06）

本文必要内容迁自 [研究提交 ad997b7](https://github.com/songconmaisaix31-design/Multi-agent-kernel/commit/ad997b786f451a6e3fea444b52a601c8b0c6ed33)，组合交付保存在 [08d1ff6](https://github.com/songconmaisaix31-design/Multi-agent-kernel/tree/08d1ff6b8f2a0df4cce538213d7943508a18e5d2)。本文的未执行/建议描述是该批研究状态，实际实现和验收以本 Fork 的 [唯一看板](../V01-TODO.md) 为准。上游 tag 的 Git 解引用现已实测为 U。未复制旧库工程配置、许可证、完整记忆或认证数据。