## P2 首批：单个已接纳依赖作为实际起点（2026-09-08）

当前仅支持下游一个父任务、且父任务无依赖的 native Git 链。仍使用原 `worker-start` / `kernel-accept`：先批准完整 Plan 及父子各自的受信验收策略，父任务真实接纳后再派发子任务；省略 `--base-branch` 由服务端选择父 candidate SHA，显式值必须相同。无依赖任务继续使用批准 Plan.baseCommit；多父、深链、SSH/WSL、普通目录明确不支持。

| 规则 | owner / 执行点 | 失败处理 | 证据层次 / 状态 |
|---|---|---|---|
| 父 accepted 必须匹配当前 Run、批准策略、最新成功 settled Dispatch 和原生 Git worktree HEAD | B / kernel-dependency-base、managed admission | completed、scope-checked、自报、旧身份/策略/候选不能选为起点 | 真实 Git/SQLite 服务测试；程序已执行 |
| 实际 baseBranch 与父接纳绑定写入原 start_options；原事务复核、限额不变 | B / createStartingWorkerDispatch | 创建前已失效则无新 Dispatch/执行资源；不重置尝试累计 | 原事务与真实工作树回归；程序已执行 |
| 异步准备后及正文发送前复核；最后紧邻发送再同步检查身份/DB | B / 原 workerStart 及失败回执 | 原生 agent-first 期间可已创建 Agent/资源；阻止正文送达并保留准确资源记录，不声称从未启动或已清理 | 终端/Agent 是替身，不是真实 Worker；程序已执行 |
| 子验收仅检查实际起点到子候选的自身净差异 | B / P1 kernelAccept 与原只读范围检查 | 先验证完整批准 Plan/父绑定，再由服务端派生单任务审核视图；继承文件不计子写权，子实际越界仍拒绝 | 真实 Git 差异及受信 Node 验收；程序已执行 |

结果、派发正文和接纳记录给出实际 `kernelBase`/父 Task/Dispatch；原 Plan 保持批准基线，不由请求改写。接纳记录是历史固定候选结果，当前有效性须经 `kernel-accept`（含缓存回放）重新验证；父记录/策略/HEAD 失效后不能继续派发或复用子接纳。Git 观察与 DB 事务不是跨进程文件锁，也不是文件系统沙箱；受信检查仍沿 P1 的可执行策略边界。accepted 不等于跨轨 integrated，未完成 P2 全链或 P0 真实 Worker 验收，未启动模型、Electron 或正式比较。

本批验证：14 文件发现/执行 542/542（含新增 27 例），Node/CLI 类型、9 个变更 TS 原 lint/format、main 构建与 diff check 通过。仓外 `evidence/continuation-20260908-003901/P2-dependency-base` 的 report 记录实际命令、固定临时候选 SHA 与首轮失败；真实运行证据仅覆盖上述服务/Git边界。当前 GitHub TLS 已被总控诊断失败，按指令暂停 push/远端查询；本地提交与远端发布分开记录。下文保留各历史批次当时状态。

## P1：受信成果接纳入口（2026-09-08）

当前入口为 `orchestration.kernelApproveAcceptance` / `orchestration.kernelAccept`，复用已验证协调者的 Run fencing、服务端计划、原 Task/监督 Dispatch、既有 Git/进程执行器及 SQLite。原生 `completed`、Worker 自报和 `scope-checked` 均不能写入 `tasks.kernel_acceptance` 的 accepted；普通 TaskStatus/result 保持原义。下文历史批次的“未实现”描述保留其原时间口径。

```text
orca orchestration kernel-approve-acceptance --run <run_id> --from <coordinator> --checks <checks.json>
orca orchestration kernel-accept --run <run_id> --from <coordinator> --task <task_id> --dispatch <dispatch_id> --candidate <full_sha>
```

`checks.json` 是协调者显式批准的独立检查源码，例如 `{"task_id":{"source":"require('node:assert/strict').equal(require('node:fs').readFileSync('answer.txt','utf8'),'42')","timeoutMs":3000}}`。服务端按原字节存储策略并生成 approvalId；不解释 Plan.acceptance，不从候选配置、package 脚本或原生 Task.spec 读取检查程序。每策略 1–16 个 Task 检查，每段最多 32768 字符、总 UTF-8 128 KiB，每检查最多 30 秒、策略总额最多 60 秒；这是单次验收检查界限，不是费用预算。

| 规则 | owner / 执行点 | 失败处理 | 证据层次 / 状态 |
|---|---|---|---|
| 仅当前合法协调者批准；最新成功 settled 的本地监督 Dispatch 与服务端 repo/base/Task 一致 | B / 原生 RPC、Run 配置 | 缺策略、身份或归属不符即拒绝 | 真实 handler/SQLite；程序已执行，限定测试运行已验证 |
| 候选等于绑定 Worker 工作树 HEAD；先范围检查，再独占 detached 快照 | B / 原 Git runner、snapshot | 原/新路径与固定对象检查复用；完整树仅安全 100644 文件，最多4096文件/16 MiB；不支持的树/元数据拒绝 | 真实临时 Git；运行已验证 |
| 原字节物化，不执行 checkout/smudge；禁 hooks、外部命令注入与自动拉取，filter/sparse/partial/worktreeConfig 拒绝 | B / snapshot、固定 Node binary+argv | 检查非零、超时、输出超限、字节/HEAD/绑定变化均不能接受 | 真实 Git + Node 子进程；运行已验证 |
| checking 是原 Task 列的占用；失效仍保留占用直到原进程退出；最终事务 CAS | B / 原 SQLite | 重复/并发及原生缓存回执都复核当前绑定；重批准/状态变化不复用旧接受；进程丢失的 checking 拒绝自动重跑，待监督处理 | 真实 SQLite、dispatcher 重放/并发；运行已验证 |
| accepted 与 native result 分离，绑定固定候选、策略和 Dispatch | B / `tasks.kernel_acceptance` | 旧完成回执和伪造 result 不可覆盖；字段是固定候选记录，读取当前有效性须走 kernel-accept 复核 | 加性 schema32、持久/迟到回归；运行已验证 |
| 依赖、集成、真实 Worker、SSH/WSL 与普通目录 | 后续原 owner | P2仍拒绝；accepted 不等于 integrated | 本批未运行真实 Worker/GUI；未支持 |

检查源码是批准者信任的可执行代码，**不是沙箱**；若它主动导入候选代码，批准者需承担该执行风险。子进程仅继承必要系统路径变量，清除 Node 注入变量和 Orca 调用凭据，Electron Node 模式仅限该子进程；不安装依赖、不调用模型、不启动桌面。验证前后检查快照真实文件字节及源 HEAD，不声称文件系统抗外部并发篡改隔离或子进程树沙箱。清理只针对本次独占临时路径，失败返回明确保留路径，绝不清理原 Worker 工作树。旧服务无新方法时 CLI 明确 unsupported，不回退原生完成。

本批证据保存在仓外 `evidence/continuation-20260908-003901/P1-acceptance`：组合12文件482例通过；新增持久性补例后两文件发现/执行55/55（37服务+18 Git/策略）；末轮 fixture 把 SQLite 放进 Git 根而导致越界，已移到测试仓库外并保留失败。窄审返修后4文件发现/执行101/101，覆盖真实临时路径别名、畸形边界解析及Git blob字节/OID不符；Node/CLI类型和编译、main构建逐项记录，首轮 fixture、类型/静态及稀疏构建资源失败保留；未运行全库、真实 Worker 或 P0。CLI 编译使用原 tsc 与 verify-cli-bin 步骤，未执行全局 install-dev-cli；既有 CLI include 漏项经批准仅加 codex-experiment-home.ts 一行，未改其环境源码。

## 批准正文修复与真实 Worker 准备（2026-09-07）

本批登记为“受管派发服务层修复候选”。R1 拒绝有依赖任务，尚不支持依赖代码落地；R2 仅恢复已验证的原协调者；R5 约束 Run 资源与尝试，不控制账户费用。尚未实现完整 v0.1。

### 实际用户流程与证据

| 用户操作 | 当前实际行为 | 验证层级 |
|---|---|---|
| 在批准计划的 Task 中填写 spec 正文，再用 Fork CLI 的 run-use --kernel-config 启用 | 原文进入持久化 kernel_config，包含 Unicode、CRLF、多行及首尾空白 | 真 CLI/注册 RPC/SQLite；执行资源为测试替身 |
| 修改原生 Task.spec，或修改调用端原计划对象 | 派发仍发送原批准正文，不采用可变文字 | 真 handler 到 sendTerminalAgentPrompt 参数断言 |
| 明确重新批准含新正文的计划 | 后续派发才发送新批准正文 | 真 runUse 与 SQLite |
| 旧计划没有批准 spec | 仍可读取；worker-start 在 Dispatch、mutation receipt、工作区和终端创建前报 kernel_task_body_required；补正文并重新批准后继续 | 红绿回归保留，缺正文不再静默放行 |
| --kernel-off | 保持原生任务正文发送 | 原有关闭回归保留 |
| 匹配 Fork CLI/候选运行时的真实独立 Worker | 尚未启动；送达、工作区、实际提交、测试、完成、停止均未验收 | 不以以上服务测试或日常 Orca 的开发 Worker 代替 |

新增批准正文是 PlanTask.spec，可选字段兼容旧 schemaVersion 1 的读取，提供时必须是非空字符串；派发必须有该字段。原生可变 Task.spec 不再是受管授权来源，也不作自动快照或临时 fallback。其他 Task 的正文不随当前任务发送。

### 来源、检查与范围

A 来源 b0f6dcda635d99f91906d54286f55738b6c5495b；B 合并 A 的历史提交 9e63f6144f61d66955dcf4086c78e03941a1c0da；B 正文修复 42c740fb1631a377c0e2d6b17e365f6b77537066。候选 64d28fdb4834b5f104c9f64be958399f2f9ffe3c 保留上批 8d7e1a7/f3a3521 成果；没有 reset 或强推。生产代码仅改 kernel-plan.ts 和 kernel-task-contract.ts。固定上游仍为 f32ce859047a85a3ea4f507f633604dfbf596a0e（v1.4.188），许可证及工程配置不变。

最终对应回归使用原 Vitest 配置逐文件 list/run：Plan 129、持久化 20、服务/CLI 组合 69、CLI 21，共 4 文件发现与执行 239 项，0 失败/跳过。重复返修复验不累加为新增用例。原三项目 pnpm run typecheck 通过；Node 项目 listFilesOnly 收录生产模块与服务回归。CLI、main、preload、renderer 构建通过，但这些构建不是运行时验收。

编译 CLI 复用原 build:cli 的 tsc 和 verify-cli-bin 步骤，仅省去全局开发命令安装；未执行 install-dev-cli.mjs，未替换 CURRENT 的 orca 命令。构建后的 node out/cli/index.js orchestration run-use --help 实际显示 --kernel-config 与 --kernel-off。

B 所辖文件静态检查通过。合成候选曾因保留旧 CLI 组合回归导致 max-lines=846，已退原 B 定向返修，保留全部用例和断言、不修改规则。原 Plan 两文件 oxlint 仍失败；同配置对父版本和本批均得到 18 项相同规则诊断，原始日志保留，不把它报告成通过，不扩大成全仓加固。

命令模板（所有源码检查在原 candidate 工作树）：

```powershell
$env:ELECTRON_OVERRIDE_DIST_PATH='C:/Users/DW/AppData/Local/OrcaKernelLab/node-test-electron-disabled'
node node_modules/vitest/vitest.mjs list --config config/vitest.config.ts <单个对应测试路径> --json=<仓外列表文件>
node node_modules/vitest/vitest.mjs run --config config/vitest.config.ts <同一测试路径> --reporter=json --outputFile=<仓外结果文件>
pnpm run typecheck
node node_modules/typescript/bin/tsc -p config/tsconfig.cli.json --outDir out --composite false --incremental false
node config/scripts/verify-cli-bin.mjs --fix-executable --fix-package-json
$env:ORCA_ELECTRON_VITE_TARGET='main' # preload / renderer 分别同样执行
node config/scripts/run-electron-vite-build.mjs --config config/electron-vite-target.config.ts --ignoreConfigWarning
```

原始日志与测试 JSON：实验目录 body-smoke-20260907；B 红绿证据 evidence/b-body-ctx1e26219942e8。早期 renderer 缺固定上游资源导致失败，已恢复所需资源后通过；大范围 promisor 下载网络失败和不完整历史 tar 均保留，未继续重复失败路线。测试用 Electron override 只是防止隐式安装，不能用它启动真实运行时。

### 尚待批准的精确本地安装动作

尚未执行：将本机已有缓存 electron-v43.1.0-win32-x64.zip（144237574 字节）验证并解压至 C:/Users/DW/AppData/Local/OrcaKernelLab/runtime/electron-43.1.0-win32-x64；向 candidate 的 node_modules/windows-native-registry/build/Release/native.node 补入现有 Orca 所带同版本 3.2.2 产物（155408 字节，已只读加载成功）。不安装系统组件、不提权、不重启、不改 CURRENT、不新增费用；如还需下载或编译其他原生依赖，再据实际错误收窄处理。

随后以本批构建产物和独立 body-smoke-20260907/runtime-profile 启动桌面候选，使用匹配的 Fork CLI。上游 serve 默认绑定 0.0.0.0，本批没有执行它，也不申请扩大网络暴露；独立桌面配置默认绑定 loopback，仍须启动后实核。模型认证和原生 PTY 是否可用要在真实启动后验证，不拷贝完整记忆或认证内容入库。

真实独立任务通过后才开展最小可信成果验收、依赖代码落地及两轨整合；12 次正式 CURRENT/KERNEL 对照不启动。

---

# Orca v1.4.188 接入与服务层验收

本页保留首批接入研究，并记录 2026-09-07 本批实际实现。唯一执行状态见 [V01-TODO.md](../V01-TODO.md)，下方“首批历史研究”不是另一份活跃计划。

## 2026-09-07 分级执行批次：R1–R5

最终源码候选 `8d7e1a7508f8f9cfe45d148f70ad6c2a5d42054d`，继续基于固定 U。R4 来源 `ef7c1f6c662f3695ba8aa58ef684da7bc27831e5`；R1/R3/R2/R5 分别为 `a32a28d1c22be9fc5a995e3d846496c3d65ca7a1`、`ecfb04e38e2a0116020faa5004b4ddb78c6bc6f4`、`6d88ff7f08d0db09fabf92bcf24fb362a081f390`、`ea4283d47fe1e633a9f2f487cdeb80d89f88e709`。集成 `2f70b945c8d11d4150919897405653e9bfad2d42` 增加 4 个组合用例，随后仅精简该测试文件的辅助代码以满足上游静态规则；没有删用例或放宽断言。

| 项目 | 实际行为与验证 |
|---|---|
| R1 依赖 | 受管 dependsOn 非空任务在资源前明确拒绝，原生 completed 不作为 accepted/代码落地证明；合法独立任务仍进入原流程。 |
| R2 恢复 | 服务端从已验证协调者生成 owner，客户端不能配置 owner。原协调者切换 Run 后可恢复，原 bindRun 事务内重查 owner/配置/generation，再执行原绑定和 fencing。旧无锚只兼容唯一原生历史协调者匹配；无历史、多历史、不同当前 owner 或损坏 owner 拒绝。 |
| R3 契约 | 实际 sendTerminalAgentPrompt 携带当前 Task 的服务端契约，包括 objective/nonGoals/baseCommit 和任务字段；不注入整个计划，也不采纳可扩权的 Task.spec。关闭时使用原 Task.spec。 |
| R4 CLI | Fork 的 CLI 新增 run-use --kernel-config <file> / --kernel-off，互斥；省略不改配置。配置只接受 repoId/plan/可选 limits，经原 runUse RPC 持久化。旧服务未确认、响应值不符均不报成功；服务端补 owner/默认 limits 合法。 |
| R5 容量 | 原 BEGIN IMMEDIATE 内以原 Run Dispatch/Worker/终端资源计数。默认并发 2、单 Task 尝试 2、Run 尝试 2×首次计划任务数；配置须有限正整数。失败、历史 Task、换 key、换计划和 off/on 不清零；停止中、未知、残留及未释放资源保守占位。两请求争最后槽位只一项创建资源，拒绝方没有 Dispatch/receipt。 |

schema 31 加性增加 runs.kernel_default_max_attempts，固化首次默认总次数；包括旧 v30 配置首次关闭再换大计划。v29/v30 文件数据库迁移、重开及历史保留受测。原 tasks/all reset 会删除计数事实，现对有配置或历史默认锚的数据库明确拒绝，包括关闭/损坏配置；RPC 在停止 relay 前拒绝、DB 原事务内再查。messages 和纯原生数据库 reset 保持原行为。没有新增清空受管历史的通道；这是 Run 内资源约束，不是跨 Run 费用控制。

以上 CLI 是 Fork 源码入口，日常 CURRENT 运行时未升级。使用 Fork 的匹配 CLI/服务时，通过已绑定的真实协调者执行：

```text
orca orchestration run-use --id <已有Run-ID> --kernel-config <JSON文件>
orca orchestration run-use --id <已有Run-ID> --kernel-off
```

JSON 的 plan 沿用现有 Plan，task.key 必须是真实 Run Task ID，不能填写内部 owner。受管低层/远端/复用终端等未支持路径仍明确拒绝。关闭模式的派发保持原生，历史保护仍保留。

### 本批实际测试

使用原 Vitest 配置，**12 文件实际发现/执行 381 条，381 通过、0 失败、0 跳过**。最终按文件分别执行并保留 12 份原始 JSON；汇总不是一次 Vitest 原始输出。受影响的服务文件在最后辅助代码返修后另行复验 66 条，不能把重复复验加成 447 个不同用例。

| 文件 | 发现 / 执行 / 通过 |
|---|---:|
| kernel-plan.test.ts | 121 / 121 / 121 |
| kernel-run-config.test.ts | 19 / 19 / 19 |
| kernel-run-limits.test.ts | 51 / 51 / 51 |
| orchestration-kernel.test.ts | 66 / 66 / 66 |
| orchestration-runs.test.ts | 18 / 18 / 18 |
| orchestration-tasks-dispatch.test.ts | 30 / 30 / 30 |
| orchestration-workers-new-worktree.test.ts | 20 / 20 / 20 |
| orchestration-federation.test.ts | 18 / 18 / 18 |
| orchestration-worker-dispatch-db.test.ts | 12 / 12 / 12 |
| orchestration-version-skew-migration.test.ts | 2 / 2 / 2 |
| orchestration-run-cli.test.ts | 21 / 21 / 21 |
| orchestration-reset-db.test.ts | 3 / 3 / 3 |

4 个组合用例用真实临时配置文件和真实 CLI handler，经传输边界适配调用已注册 RPC 与 SQLite：合法含服务端 owner/默认 limits、非法保持原配置且无资源效果、关闭后原生启动、无开关保持配置。使用 vi.importActual 加载真实 CLI，避免跨 composite 项目静态导入；CLI 实现仍由原 CLI 类型项目检查。没有 mock CLI handler、runUse、validatePlan 或数据库。

```powershell
$env:ELECTRON_OVERRIDE_DIST_PATH='C:/Users/DW/AppData/Local/OrcaKernelLab/node-test-electron-disabled'
$files = @(
  'src/main/runtime/orchestration/kernel-plan.test.ts'
  'src/main/runtime/orchestration/kernel-run-config.test.ts'
  'src/main/runtime/orchestration/kernel-run-limits.test.ts'
  'src/main/runtime/rpc/methods/orchestration-kernel.test.ts'
  'src/main/runtime/rpc/methods/orchestration-runs.test.ts'
  'src/main/runtime/rpc/methods/orchestration-tasks-dispatch.test.ts'
  'src/main/runtime/rpc/methods/orchestration-workers-new-worktree.test.ts'
  'src/main/runtime/rpc/methods/orchestration-federation.test.ts'
  'src/main/runtime/orchestration/orchestration-worker-dispatch-db.test.ts'
  'src/main/runtime/orchestration/orchestration-version-skew-migration.test.ts'
  'src/cli/handlers/orchestration-run-cli.test.ts'
  'src/main/runtime/orchestration/orchestration-reset-db.test.ts'
)
foreach ($file in $files) {
  $name = [IO.Path]::GetFileNameWithoutExtension($file)
  node node_modules/vitest/vitest.mjs list --config config/vitest.config.ts $file --json="$evidence/$name.list.json"
  if ($LASTEXITCODE -ne 0) { throw 'Discovery failed' }
  node node_modules/vitest/vitest.mjs run --config config/vitest.config.ts $file --reporter=default --reporter=json --outputFile.json="$evidence/$name.results.json"
  if ($LASTEXITCODE -ne 0) { throw 'Tests failed' }
}
pnpm run typecheck
# 新模块收录补充证据；不替代上述类型检查：
pnpm exec tsc --noEmit -p config/tsconfig.node.json --listFilesOnly
pnpm exec tsc --noEmit -p config/tsconfig.cli.json --listFilesOnly
$env:ORCA_ELECTRON_VITE_TARGET='main'
node config/scripts/run-electron-vite-build.mjs --config config/electron-vite-target.config.ts --ignoreConfigWarning
```

复现前将 $evidence 指向自行创建的仓外日志目录。实际日志在实验目录 tier-candidate-20260907。三项目类型检查退出 0；清单实测含 kernel-run-limits、kernel-task-contract、组合测试及 CLI 新模块/测试。21 个变更 TS 文件 oxfmt/oxlint 均通过。main 构建退出 0，3117 modules；最后仅测试辅助代码改变，生产源码与该构建一致。没有修改上游许可证、锁文件或工程配置。

### 异常与验收边界

- 多路径传参曾产生零测试失败，已保留 initial-no-tests-observed.results.json；改为逐文件执行并核对原始 JSON。未将零测试或合成结果当成原始成功回执。
- 合并会重新移除 sparse 工作树中预先补齐的资源；总控在合并后从固定 U 原样恢复缺失 icon/app-icons/tray/notification-sounds，资源 diff 为零，再只重跑 main 成功。
- Windows checkout 的 CRLF 导致格式检查失败；格式化后非测试文件没有 Git 内容差异。组合测试先超过 800 行限制，随后精简辅助代码，保留 4 个组合用例及全部语义，未关闭静态规则。
- 原集成 worker_done 虽报告 succeeded，但构建尚未过，总控未据此验收。释放发生 release_unknown/tab_not_found，实测终端已 operator_close；用原认证目录和同一 Codex session 恢复 terra/medium，再完成返修。首次 R4 和恢复后输入回执的 agent_prompt_stalled 均保持 failed，以普通源码交付验收，没有伪造 worker_done。最后 Git 确认框的自动答复被 Orca 以 agent_prompt_blocked 阻止，已取消挂起命令；总控在原授权 Git 环境代执行最终一文件 commit/普通 push，不扩大权限。
- 原主对照仍只有 CURRENT/KERNEL。未运行真实 Kernel Worker/停止闭环、完整所有 Vitest、完整桌面包或 12 次正式实验；G03 隔离和可信 accepted/merged/依赖代码落地仍未完成。没有重试 Docker/WSL、提权、扩大权限、购买额度或切换付费通道。

## 上批 275 条验收历史

以下保留上批候选的实际记录；其中 schema 30 和无 CLI 的表述是历史状态，当前以本批增量为准。

## 已实现入口

受测候选 `0c4286d722342d0a2155a1e6d2e7c5637c94f61a`，基于固定 U=`f32ce859047a85a3ea4f507f633604dfbf596a0e`。A 迁移 `7a2e4db8727ab0a8af4745a2f31a2be9219f3ffc`、B 接入 `8c4f3045771e98014cf56709086b786fcb74eb0c` 均为候选祖先，候选 src 与 B 提交一致；集成未修改领域代码。

- `src/main/runtime/rpc/methods/orchestration-runs.ts`：真实已注册的 `orchestration.runUse` 接受可选 `kernel: {repoId, plan}`。调用者必须提供原生受验证的当前协调者身份；任务 key 必须对应本 Run 真实 Task，依赖与原生 Task 一致。省略 kernel 保持配置，显式 null 在无活跃/未释放资源时关闭；本批没有新 CLI 参数或 UI。
- `orchestration-workers.ts`：在远端分支和资源创建前执行 `admitKernelWorkerStart`，只允许受管本地 Git new-top-level，并固定 repo/baseCommit。异步准备后再次核对配置/任务；`createStartingWorkerDispatch` 在既有 BEGIN IMMEDIATE 中复核，在写 receipt/dispatch/资源前拒绝过时策略。
- `orchestration.ts`：真实低层 dispatch handler 在 dryRun 和异步准备后拒绝受管 Run；`createDispatchContext` 在既有 SAVEPOINT 内再次检查。受管 existing/child/terminal/folder/SSH/远端/WSL 均拒绝；关闭模式保留原生本地和远端行为。
- `kernel-run-config.ts` 和原 DB schema：可空 `runs.kernel_config`，schema 29→30 加性迁移；SQL NULL 表示关闭，损坏 JSON、序列化 null、未知版本等拒绝，不能静默降级。

合法计划的服务层测试调用真实 runUse→workerStart 注册函数及 SQLite，验证进入原生创建/派发流程；非法、无权限、请求内假关闭、配置变化、Task 变化和未支持路径测试验证资源边界未调用。原生身份校验器是真实函数；终端、工作树创建及资源观测是测试替身，所以“原生流程通过”仅指服务层集成，不等于启动真实 Kernel Worker。

## 实际发现与执行

Windows / Node 24.16.0 / pnpm 10.24.0 / Vitest 4.1.5 / TypeScript 7.0.2。使用上游原 `config/vitest.config.ts`，新测试位于其 `src/**/*.test.ts` 范围；原 A 的 121 条 node:test 只改 Vitest 注册和导入，原规则实现逐字节保留。

| 测试文件 | 实际发现 | 实际执行/通过 |
|---|---:|---:|
| kernel-plan.test.ts | 121 | 121 |
| kernel-run-config.test.ts | 18 | 18 |
| orchestration-kernel.test.ts | 36 | 36 |
| orchestration-runs.test.ts | 18 | 18 |
| orchestration-tasks-dispatch.test.ts | 30 | 30 |
| orchestration-workers-new-worktree.test.ts | 20 | 20 |
| orchestration-federation.test.ts | 18 | 18 |
| orchestration-worker-dispatch-db.test.ts | 12 | 12 |
| orchestration-version-skew-migration.test.ts | 2 | 2 |
| 合计（9 个文件） | 275 | 275 |

最终 list/run 退出码均为 0，失败 0、跳过 0。275 中新增/迁移的三文件为 175 条，其余 100 条是所选原生回归；不是全仓所有测试。Federation 回归输出的模拟断线 stderr 属于通过的预期场景。

使用的 PowerShell 命令如下；输出目录为仓库外临时证据目录。list 的 `--json=路径` 必须明确指定，避免可选参数吞掉首个测试路径。

```powershell
$evidence = Join-Path $env:TEMP ('orca-kernel-service-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $evidence -ErrorAction Stop
$env:ELECTRON_OVERRIDE_DIST_PATH = Join-Path $evidence 'electron-not-installed'
$files = @(
  'src/main/runtime/orchestration/kernel-plan.test.ts'
  'src/main/runtime/orchestration/kernel-run-config.test.ts'
  'src/main/runtime/rpc/methods/orchestration-kernel.test.ts'
  'src/main/runtime/rpc/methods/orchestration-runs.test.ts'
  'src/main/runtime/rpc/methods/orchestration-tasks-dispatch.test.ts'
  'src/main/runtime/rpc/methods/orchestration-workers-new-worktree.test.ts'
  'src/main/runtime/rpc/methods/orchestration-federation.test.ts'
  'src/main/runtime/orchestration/orchestration-worker-dispatch-db.test.ts'
  'src/main/runtime/orchestration/orchestration-version-skew-migration.test.ts'
)
pnpm exec vitest list --config config/vitest.config.ts @files --json="$evidence/list.json"
if ($LASTEXITCODE -ne 0) { throw 'Vitest discovery failed' }
pnpm exec vitest run --config config/vitest.config.ts @files --reporter=default --reporter=json --outputFile.json="$evidence/run.json"
if ($LASTEXITCODE -ne 0) { throw 'Vitest execution failed' }
pnpm run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Typecheck failed' }
pnpm exec tsc --noEmit -p config/tsconfig.node.json --listFilesOnly > "$evidence/node-files.txt"
if ($LASTEXITCODE -ne 0) { throw 'TypeScript file discovery failed' }
$env:ORCA_ELECTRON_VITE_TARGET = 'main'
node config/scripts/run-electron-vite-build.mjs --config config/electron-vite-target.config.ts --ignoreConfigWarning
if ($LASTEXITCODE -ne 0) { throw 'Main build failed' }
```

`pnpm run typecheck` 原脚本检查 node、tc.cli、tc.web 三项目，实际退出 0。listFilesOnly 是附加收录核查，不能替代该类型检查；实测包含 kernel-plan、kernel-run-config、orchestration-kernel-admission 及相邻新测试。main 目标采用上游已有目标配置，实际构建退出 0，out/main/index.js 内检出 validatePlan、admitKernelWorkerStart、assertKernelWorkerPolicy。没有修改 tsconfig/Vitest/build 配置，没有将 Node 执行 TypeScript 当作类型检查。

原始 stdout/stderr、发现 JSON、执行 JSON 和逐文件计数保留在本机实验目录的 `candidate-20260907-0c4286d` 子目录；公开仓库记录可复现命令和汇总，不迁入认证、完整记忆或私有业务资料。

## 修复经过与验证边界

- 依赖按锁文件安装且跳过 install scripts，但 Electron 包 require 仍可能触发自身安装。B 首轮服务测试确实触发过一次失败的隐式安装，已停止；之后测试/构建均设置当前进程的不存在 Electron 路径，避免自动下载/运行。这个设置不是实际 Electron 运行环境通过。
- C 首次 list 参数误将测试源码当 JSON 输出文件，首轮 run 失败；已保留误输出并从当前 HEAD 原样恢复，改为明确输出路径后重新发现和执行全部 275 条。没有删断言或改领域源码。
- main 首轮因稀疏工作树缺少固定上游资源失败；总控从 U 补齐 icon/app-icons/tray/notification-sounds 后重跑成功。许可证、锁文件、根配置及业务代码不因此修改；上游 SSH 动态/静态导入提示保留。
- C 原生派发的两次 agent_prompt_stalled 回执仍为 failed。复用同一个 C，以普通 CLI 交接完成合并、测试、构建、push 和 status 报告；源码结果不被冒充为成功的 worker_done。
- 未运行完整所有 Vitest、完整 renderer/桌面打包、真实 Worker 启动/停止或 12 次 CURRENT/KERNEL 实验。原生 completed 不是 Kernel accepted/merged；词法路径契约不是文件系统沙箱。本批服务准入成果不放行整个 v0.1。

## 首批历史研究（固定 U；下文“待补/未执行”是当时状态）

2026-09-06 · B 接入轨 · 规划基线 `14c174adf1b3dd373a83b437467d43f60f2a6073`。本文保留首批只读研究结论；来源库是独立前期成果库，当前 GitHub 实测为公开。正式开发已迁至获准复用的公开 Orca Fork，实时状态仅见 ../V01-TODO.md。A 唯一维护计划类型，本轨不另定义字段或调度器。

## 固定来源与结论

官方 [v1.4.188 目录页](https://github.com/stablyai/orca/tree/v1.4.188/src/main/runtime/orchestration) 的 `currentOid` 为 **`f32ce859047a85a3ea4f507f633604dfbf596a0e`**（下称 U）。已有限读取 raw 源码，并将 tag 与 U 的 `package.json`、`orchestration-workers.ts`、`orchestration.ts` 比较，三份字节一致。后续链接全部固定 U，不以 main 推断本版本。

**关键更正：U 没有手册引用的 `orchestration-dispatch-methods.ts`（固定 tag 请求返回 404）；低层 dispatch 在 `orchestration.ts:1587`。不存在一个已读到的、包办两条路径且早于全部资源副作用的专用 Kernel 入口。** 最小建议是在两个服务端 handler 共用准入函数，并在各自既有数据库事务内复核并占用；只拦 CLI、renderer 或最后一次发送提示词均不足。

| 上游已做 | CURRENT 已做 | 仍需补充 |
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

## M2 前置：只读 Git 候选范围检查（2026-09-08，B）

本批新增 `reviewKernelCandidate({ plan, taskKey, repoPath, baseCommit, candidateCommit, executionHost })`，返回 `scope-checked`（固定 SHA、旧/新路径集合）或 `rejected`（错误码、原因）。调用者必须提供服务端已批准的 Plan 和宿主归属；入口仍调用 A 的 `validatePlan`，不从候选文件读取授权。**当前无 CLI/RPC 消费者接线，范围通过不是 accepted/integrated，也不是 Worker 或验收正文执行结果。**

| 规则 | owner | 执行点 | 失败处理 | 测试/提交证据 | 状态 |
|---|---|---|---|---|---|
| 词法 Plan、任务 key、文件/目录边界 | A 类型/validator；B 调用 | `kernel-candidate-review.ts` 入口、`kernel-candidate-review-paths.ts` | 非法 Plan、未知任务、越界/特殊路径拒绝 | 本批真实 Git 入口回归；复用既有 validator | 运行已验证 |
| 显式完整 SHA、对象确为 commit、批准基线一致、base 为 candidate 祖先 | B | 原生 `gitExecFileAsync`：`cat-file`、`merge-base --is-ancestor` | 缺对象、错误、无关历史均 rejected；禁用 replace，拒绝 shallow/grafts/partial clone | [代码 706cf15](https://github.com/songconmaisaix31-design/orca-kernel/commit/706cf15ffc9d4328167ffbdb4c03aa72be620ac2) | 运行已验证 |
| 完整 NUL 端点差异与两端树交叉核对；写权只检查实际增删改路径 | B | `diff-tree -r --no-renames`、`ls-tree -r -z --full-tree`、changed blob 检查；旧/新树分别校验文件/目录形态 | 空差异、遗漏、解析/截断/读取错误拒绝；特殊路径和大小写歧义拒绝；真实越界增删改返回 out_of_scope | 初批 63/63 保留为历史；本次 copy/形态语义返修证据见下文 | 运行已验证 |
| 只支持 native 本地普通/linked Git worktree；变更模式仅 `100644` | B | 仓库路径/元数据检查及 raw 两端模式检查 | SSH/WSL/UNC、普通非 Git 目录、symlink/gitlink/执行位变化明确拒绝，无本地 fallback | 同上，覆盖受限宿主及真实 linked worktree | 运行已验证 |
| 固定 argv，不用 shell；禁止外部 diff/textconv/hooks；每命令 15 秒、输出上限 2 MiB | B | 既有 runner，加显式只读选项、清除继承 Git 覆盖变量 | Git 失败/超限拒绝，不把部分输出当空差异 | 注入输入、replace、恶意配置、真实大树回归；Node-only | 运行已验证 |
| 依赖任务、可信验收执行、正式接纳/集成 | 后续总控决定 | 本批依赖入口拒绝；其余无执行点 | 不放开依赖，不执行 acceptance，不写状态或自动合入 | 本批未执行真实 Worker、验收命令或候选 Electron | 未支持 |

验证环境：Windows，Git `2.47.0.windows.1`、Node `24.16.0`、pnpm `10.24.0`；单文件 Vitest 实际发现并通过 63 项，`pnpm run typecheck:node`、Node `tsc --listFilesOnly` 收录三份新 TS、改动代码 oxlint/oxfmt、diff check 均通过。日志位于仓外 `C:/Users/DW/AppData/Local/OrcaKernelLab/evidence/continuation-20260908-003901/B`；Node 测试设置进程级 `ELECTRON_OVERRIDE_DIST_PATH`，没有安装依赖或启动 Electron。首轮 7 项 fixture 失败源于 Windows `update-index` 丢弃特殊名称，改用真实 `mktree` 并先断言树内名称后通过，未削弱负例。

本次范围语义返修以 `64c9b36` 为基线：生产代码未改时新增 9 例实际为 7 失败、2 通过（未变来源副本误报 out_of_scope，形态转换误报 unsafe_path）；修复后同组 9/9，完整候选 72 + Plan 129 实际发现并执行 201/201。首轮完整组清理 EBUSY、类型检查缺少五个已跟踪输入及新测试风格失败均保留；最终 Node 类型及变更 TS lint/format 通过。仓外证据位于 `B-scope-semantics`，本次未复跑历史 456 例、构建或真实 Worker。

命令遵守 [Git 2.25 基线](reference/git-compatibility.md)，选项依据 [2.25 diff-tree 文档](https://git-scm.com/docs/git-diff-tree/2.25.0)；本机未另装或实跑 Git 2.25。范围是两棵固定提交树的净差异，不推断 rename/copy 或内容来源；未改动的范围外来源不需要写权，新增副本只检查目的路径，移动按旧路径删除和新路径新增检查。旧树和新树分别理解文件/目录形态，范围内 file-to-dir 与 dir-to-file 可以通过；不审计中间已回退的提交、不锁定仓库元数据、不证明工作目录 junction/hardlink 沙箱或仓库文件的抗并发篡改能力。范围结果尚未接入接纳流程，后续调用者仍须验证批准来源及实际宿主，并另行完成受信验收与集成。

## 本批监督契约（2026-09-08，主控）

| 规则 | owner | 执行点 | 失败处理 | 验证证据 | 状态 |
|---|---|---|---|---|---|
| Task 明确基线与唯一写入路径；共享接口由 B 单一维护 | 主控派发，A/B 执行 | 原生 Task.spec 与提交差异审查 | 越界退回原 owner；不冒充文件系统沙箱 | 看板所列三 Task；候选 `479322a` 相对 `e39c3c7` 仅四文件 | 提示约定 |
| 开发 Run 的原生身份 fencing；候选独立身份仍待测 | 原生 Run 服务；主控 / 环境 terra 核对 | 日常 run-current、generation 与当前 Delivery；仅原生服务拒绝属于程序强制 | consumer_fenced 为程序拒绝；后续核实绑定、不复制身份为操作约定 | 开发 `run_17a07a644aaa` / generation 2；不据此声称候选身份已验证 | 程序已执行 |
| 真实工具审批保留；续接先确认旧执行者不再写入 | 主控 / 原执行者 / 用户 | 工具报告 readiness / 审批事实；续接及换人决定由监督者落实 | 只暂停依赖操作，不代按、不换 Agent 绕过是监督约定，非本模块自动拦截 | A readiness 拒绝是工具事实；terra 等人工恢复；B 两批完成后 retain | 提示约定 |
| 源码候选经测试和固定提交审查后普通集成 | B 源码与串行集成，主控验收 | 原生 worker_done、当前 Delivery ACK、Git 快进 | 失败回原 owner，保存首轮失败，不放宽断言 | 历史 `479322a` 的 13 文件发现/执行 456/456、Node 类型及 main 构建；本次未复跑，本地报告索引在看板 | 运行已验证 |
| 实际模型与用量以会话记录为准；未通过功能不启动 12 次比较 | 主控监督 | 工具读取 turn_context / 计数；人工或 Agent 执行里程碑与预算策略 | 未知单列，不编造费用或实验效果；不声称已有自动预算或实验启动门 | 原批同一 B astra/high、A/terra 增量 0 的快照记录保留；非自动预算控制证据 | 提示约定 |
| 正式成果接纳、依赖代码落地与真实 Worker 停止/接续 | 后续原 owner | 当前无完整执行点 | 维持未通过，不将范围检查等同接受成果 | M1–M5 剩余条件见唯一看板 | 未支持 |

本表区分工具采集事实、人工/Agent 提示约定、实际调用入口的程序强制，以及具体运行验证；“运行已验证”只覆盖列明的命令和边界，不表示自动接纳门。派发文件范围、换人和预算策略尚需监督者落实，不标成程序已执行；真实 Git 回归及服务层终端/资源替身均不是真实 Worker。历史通过/失败记录不变，也不表示不可篡改审计、强制写入隔离或跨平台运行证明。
