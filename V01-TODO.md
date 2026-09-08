# 当前批次：范围语义已修复，真实独立 Worker 冒烟待通过（2026-09-08）

## 11:16 范围语义窄返修

保留 `479322a` / `64c9b36`；原 B 在 `task_533812723d06` / `ctx_99a7250f50b1` 从干净 `64c9b36972b51ef1636cbf81f79241bc56d96bb4` 修复，候选 `1c64cd5fac0ef951e69b5a819493726a26a6a804` 已 push、远端一致，主控已按固定窄差异快进接纳。只改两个既有生产模块、同文件回归与监督契约措辞（四文件 +91/-25）；实际 B 为本轮 turn_context 核实的 astra/high，原生 worker_done 已核对、当前 Delivery 已 ACK、终端 retained。

实际修复前：未改生产代码时 9 项针对真实 Git 回归为 7 失败、2 通过。修复后：未改范围外来源复制到允许目录，三种配置均 `scope-checked` 且仅目的路径进入写权集合；同时修改/删除来源仍 `out_of_scope`，移动仍检查实际删除和新增。旧/新树分别校验，同范围文件与目录双向转换通过，越界形态转换正确返回 `out_of_scope`，不再误报混合形态的 `unsafe_path`。授权使用 `--no-renames`，未删除其他安全检查。

验证：同 9 项全部通过；候选 72 + Plan 129 实际发现/执行 **201/201**，无跳过，Node 类型及改动 TS lint/format 通过。完整组首轮清理 `EBUSY`、新增测试风格和五个稀疏输入缺失失败保留；只加测试清理有界重试，按固定 Git blob 恢复五个输入且字节一致。本轮未复跑历史 456 项、构建或真实 Worker；外部审查不充当本机验收。完整日志沿仓外原位置 `evidence/continuation-20260908-003901/B-scope-semantics/report.md`。契约已区分工具采集、监督约定、程序强制与限定的真实运行证据；仍只是 M2 范围前置，无 accepted、依赖整合或真实 Worker 成果。

M1 当前：本轮两次只读核对原 terra，末次仍 connected、`agentWait=codex-interactive-prompt`，lastOutputAt 未变化，无修正命令的新执行回执。候选实际 CLI/runtimeId、协调身份及 Kernel 配置没有新验证结果，也没有新 Worker 产物；这仍是原人工恢复条件，不包装为新的候选失败。用户在原 terra 正常恢复后由总控接续最小候选执行链，范围返修不阻塞该冒烟；未代按、未替代执行、未重复启动或开展 12 次比较。

本轮用量起点为 11:04:06 用户消息前计数，终点总控 11:16:42 / B 11:16:25；同会话无重置。总控输入 3,505,699（缓存 3,384,448）、输出 11,618，total 3,517,317；B 输入 4,383,952（缓存 4,119,680）、输出 17,588，total 4,401,540；terra 增量 0。缓存包含于输入，非费用，不含快照后收尾；仓外原目录 `scope-usage-start.json` / `scope-usage-end.json` 保留计数。

## 2026-09-08 持续开发：独立源码与真实冒烟分开推进

以用户《主控持续开发指令与最小审计契约》为当前授权；旧批“只做环境、不唤醒 A/B、真实冒烟前禁止全部接纳源码”的阶段限制只保留为历史。真实运行门槛不降低，依赖派发仍拒绝，12 次正式比较不启动。开发 Run 沿用 generation 2；terra 只处理原候选状态命令，审批由用户处理，不通过其他执行者绕过。

| 轨道 / owner | 唯一写入范围 | 本批输入、输出及验收 |
|---|---|---|
| A / 原 rules 标准模型会话 | `src/main/runtime/orchestration/kernel-plan.ts`、`kernel-plan.test.ts` | 实查原分支基线；仅消除既有静态诊断，保留稀疏数组负例和行为；原测试发现/执行一致、Node 类型与两文件静态通过，commit/push |
| B / 原 integration 强模型会话 | `src/main/runtime/orchestration/kernel-candidate-review.ts`、`kernel-candidate-review.test.ts`、必要相邻同前缀测试；`docs/ORCA-INTEGRATION.md` 新增本批小节 | 从受信计划与固定 Git 提交检查独立任务候选的实际差异范围，真实临时 Git 正/负例；只读且不执行候选代码，不持久化 accepted、不放开依赖，不改 CLI/RPC/DB/Plan/环境；新接口唯一 owner 为 B |
| 主控 | 本看板与关键决策/验收 | 固定实际 Task/Dispatch、模型、提交、范围与用量；原标准角色停在交互提示，本批由已完成源码的同一 B 串行机械集成，领域返修回 owner |

源码并行仅在任务权限/模型核验后成立；审批或派发失败保持原状态，不以普通 status 冒充 worker_done。候选 review 仅为 M2 前置检查，受信验收执行、正式接纳和依赖落地仍未实现。证据不足时拒绝；不建设新审计或证明平台。

本批实际派发：A `task_c56189ed0cef` / `ctx_1f6ed85638ba` 在 agent_readiness 被 `codex-interactive-prompt` 拒绝并 retain，未实施；B `task_efddfd27a39f` / `ctx_03aa91744c33` 已 input_accepted，复用原会话，00:40:44 的 turn_context 核实 `gpt-6-astra/high`。未新建模型会话。日常 CLI 在无终端环境变量且同时传 Worker `--terminal` 时会将接收者当作隐式发送者；首条调用在创建 Dispatch 前 consumer_fenced，核对原生当前终端后显式指定本主控 `--from` 正常派发，未重绑 Run或复制凭据。

B 实测主模块 336 行超过原 300 行上限后，经主控定向批准增加同 owner 的 `kernel-candidate-review-paths.ts`，只拆出 Git NUL 树/差异与路径模式检查，不扩功能或关闭规则。

B 源码验收：`706cf15ffc9d4328167ffbdb4c03aa72be620ac2`，说明 tip `f38d56fb5c15650e05671835082dea3b278590c8`，远端同 SHA；3 份 TS 与原说明追加共 4 文件。主控已逐文件审查固定 Git 对象与真实测试负例：63/63、Node 类型/收录、原规则 lint/format 通过；首轮 fixture 与未用导入失败保留在仓外 `evidence/continuation-20260908-003901/B`。仅接纳为 M2 源码前置，尚无 CLI/RPC 接线、受信验收执行或 accepted 状态。当前 Git 2.47 实跑，不冒充 Git 2.25 实跑。B 已 worker_done 并 retain，下一步使用新 Task/Dispatch 在原 B 工作树串行合入当前开发基线、运行组合回归后普通 push；主控只作 Git 快进接纳。A 静态返修和 terra 真实冒烟仍待原交互恢复，没有替代执行。

01:03 集成验收：同一 B 的 `task_aad1128aeb45` / `ctx_5ea49c253910` 完成普通合并候选 `479322ad17f758271d4140e936c0d0001b7c549e`（双亲 `f38d56f`、主控看板基线 `e39c3c7`），主控已快进接纳。13 文件实际发现/执行 **456/456**，含 Plan 129、真实 Git 候选 63；Node 类型、新三文件静态与 main 构建通过。第一轮缺 CLI 导致漏发现 21 项且 69 项失败、缺构建输入导致类型/构建失败均保留；仅物化固定 HEAD 的 60 个缺失跟踪文件并逐个核对 blob，未改其内容。相对 `e39c3c7` 仍仅三 TS 与说明追加；A Plan 和其他领域无改动。B 两批 worker_done 已核对、各新 Delivery 已 ACK，终端 retained，无关闭或新增会话。证据：仓外 `C:/Users/DW/AppData/Local/OrcaKernelLab/evidence/continuation-20260908-003901/B-integration/report.md`。

当前剩余：M1 候选终端内 CLI、合法协调身份、Kernel 持久配置及独立 Worker/短停止均未通过；原 terra 命令取消后未产生新的执行证据，按用户要求暂停，用户在原 terra 输入“读取收件箱最新要求，仅修正状态检查命令并重新提交审批。”后才接回。A 的 `codex-interactive-prompt` 仍使本批静态返修未执行，既有 18 项诊断保留。B 已完成本批独立前置并保留，未借其绕过上述审批。M2 接纳执行/生产接线、M3 依赖及两轨实际整合、M4 完整回归和 M5 比较均未完成；不以当前服务层/真实 Git 测试冒充真实 Worker。下一源码接线须基于 M1 实际身份结果；本批不扩成另一套模拟接纳链。

简短用量：起点为本批操作快照（总控计数截止 00:38:33），终点总控 01:01:53、B 01:02:03；同会话无重置。总控 astra/high 增量输入 11,953,379（缓存 11,826,560）、输出 22,642（推理 8,194），total 11,976,021；B astra/high 输入 8,412,838（缓存 8,218,752）、输出 40,702（推理 11,663），total 8,453,540。A 与环境 terra/medium 记录增量均为 0；无新模型会话。缓存包含于输入、推理包含于输出，不是费用，也不包含快照之后的收尾；原计数仅在仓外同目录 `usage-start.json`、`usage-end.json`，未上传会话。

- 2026-09-08 00:06 主控交接：旧主控最后一轮 task_complete、无未返回工具调用；按用户授权由当前会话 `01a07c86-4399-7411-9c22-56420ebf0596` 经日常 Orca 原生 run-use 接管原开发 Run `run_17a07a644aaa`，协调终端 `term_a7546a3e-cf67-4a0c-9f20-3ea0e571da8a`，consumer_generation 1→2，run-current/run-show 一致；新绑定 Delivery 查询 count=0、deliveryId=null，无需 ACK。旧会话及 A/B/terra 保留，历史任务状态不改；terra 启动命令已返回 PID 120304，当前仍待下一条候选状态检查的人工审批，未重复启动、未派发，候选路由及真实 Worker 仍待验收。

## 22:08 续批：候选 CLI 接线与原生协调会话

用户局部批准修复冒烟启动器遗漏的开发 CLI 准备与调用接线，复用原生 Agent 创建和凭据传递；不扩大服务层功能。当前同一标准执行者负责实现、针对回归和实验操作，总控审关键差异与结果，A/B 保留且不唤醒。保留旧空 Run/Task 和停止的普通 shell；它没有原生 Agent 身份，不能凭句柄配置 Kernel。若正常恢复不适用，仅允许一次替代测试 Run。真实任务继续使用原一次性仓库及外置验收，协调会话与 Worker 用量均计入；完成与独立停止分别验收。

22:43 实际交付：候选源码 `7bf194e38ea721d06d9d37f1e451c2f653aa817e`、`14f6a05ac84f53bb5add71d6389383361478fd26` 已 push，文档 HEAD `2b0ba4238c209c3cd2272c514bf1ef54d016ceb2`。正式分支按来源顺序接纳为 `952b3f3e7e22bcb826544288ec6f8d72d177e412`、`4468d5e6c3dae096887872434a71850ddd49b104`，随后接纳两项文档提交。修复复用 prepareDevCliTerminalWrappers，在清除继承身份后重建候选 repo/profile/Electron/CLI 绑定，Windows 环境名大小写处理并只保留一个 Path；诊断入口恢复只读，不改全局 CLI。固定上游仍为 v1.4.188 / `f32ce859047a85a3ea4f507f633604dfbf596a0e`，Electron 43.1.0 win32-x64。

实际验证：候选 `pnpm exec vitest run config/scripts/run-windows-managed-smoke.test.mjs config/scripts/dev-cli-terminal-wrapper.test.mjs` 在 22:42 再核验为 2 文件、4 条通过；执行者已运行 typecheck:node 与 build:cli。真实 PowerShell 诊断子进程的 Get-Command orca 指向实验 profile/cli/bin/orca.cmd，repo/profile/runtime 准确绑定、Path 键唯一。这仍是启动器子进程证据，**不是新候选终端内的路由验收**。已有 37 条分散测试不覆盖新增完整身份链路；新增连接草案失败，发现 ORCA_TERMINAL_HANDLE 由后续生产 PTY 层注入，不能仅取 createTerminal 中间 env，也不能手写成功 proof。草案未收录为通过测试；该回归缺口保留。

启动异常核实：三份 resources/skills 输入 current-manifest.json、snapshot-registry.json、release-mapping.json 均从固定 HEAD 补齐，无资源 diff。原错误来自已停止候选；hook ledger/provenance 的实际目标位于实验 managed home，skills discovery 为只读库存扫描，没有据此认定日常写入或扩权限。原 non-check-only 误调用及未知退出码仍保留，本轮未重跑安装入口。

当前精确阻塞：同一 terra 会话一次恢复后，在已授权的 Start-Process 启动专用候选命令处进入交互确认。Orca CLI 对普通提示及单次 y 都返回 `agent_prompt_blocked`，尚未执行该启动命令；未绕开交互保护。用户需在原候选执行者终端为这一条已授权启动选择一次 Yes, proceed，不需要重新授权项目。等待界面和原会话保留。旧 Run/Task 未变，替代 Run=0、新原生协调会话=0、Worker/Dispatch=0、Kernel 配置未持久化，目标文件与任务提交未产生；正常完成与独立短停止均未验收。未计入 12 次正式对照。尚不能交付候选新终端路由或真实 Agent 配置成功证据。

本段用量由 22:08 用户消息前最近计数作起点；以下为客户端增量，缓存包含于输入、推理包含于输出，不等于费用或免费账户 Worker 消耗。原执行者的中断式续送触发退出后，用同一 session ID、terra/medium 正常恢复一次，计数重置单列；未新建实施 Agent 或唤醒 A/B。实验协调者/Worker 均未启动，无本批实际模型用量记录。

| 会话区段 | 输入 | 缓存输入 | 输出 | 推理输出 | total | 截止北京时间 |
|---|---:|---:|---:|---:|---:|---|
| 总控 astra/high | 9,218,280 | 9,096,576 | 23,759 | 4,931 | 9,242,039 | 22:42:48 |
| 同一 terra/medium 恢复前 | 8,944,551 | 8,845,056 | 15,213 | 4,276 | 8,959,764 | 22:22:50 |
| 同一 terra/medium 恢复后，计数重置 1 次 | 7,268,488 | 7,062,528 | 16,059 | 5,519 | 7,284,547 | 22:38:34 |

实验 native-run/cli-binding-usage-start.json、cli-binding-usage-end.json、cli-binding-usage-segments.json 保留原计数与分段；初次起点比较的时区问题已在后续动作前纠正，以上以 DateTimeOffset 比较的 segments 为准。快照后的记录与回复未包含。以下旧批失败及状态保留为时间点历史。

## 21:46 免费实验账户最小链路：登录成功，受管派发前拒绝

本轮仅链路验证，没有项目源码改动、依赖安装、CURRENT 变更或正式对照。保留 Windows 候选 `f3f675d`、runtime `e61c400d-a1ca-438c-8c9e-1835c65c6494`。实验 home 的官方登录返回 `Logged in using ChatGPT`，候选账户 `oauth/hasAuth=true`，额度状态 `ok`，300 分钟窗口用量 0%，没有切账号/API/充值或复制认证。

工具已建一次性 `body-smoke-20260907/managed-worker-once` 仓库，初始空提交 `fa9c84e21297cc10fe6a3e8cac5d4f126c90fafe`；外置 `verify-managed-smoke.ps1` 验收只允许 `smoke-result.txt` 的精确 UTF-8 无 BOM 字节 `ORCA_KERNEL_MANAGED_SMOKE_OK` 加 LF，单一本地任务提交。准备的无依赖 Plan 限并发/累计/单任务尝试为 1；未将此准备状态当作已持久化受管授权。

实际结果：Run `run_4b9bbf27779b`、Task `task_3b7941cc07dc` 已创建，但 Kernel 配置未持久化。裸 `orca` 的 CLI 来源误指日常安装版，报 `invalid_argument / Unknown flag --kernel-config`，未到运行时；显式 Fork CLI 到达候选后报 `consumer_fenced / Kernel changes require the verified Run coordinator`。根只读核对 `orchestration-kernel-admission.ts`，拒绝在调用者身份验证处，终端句柄本身不构成授权。没有绕过身份、手工改绿、模型盲试或重新派发。

候选 Worker/Dispatch 记录均为 0，实际 Worker 模型、effort、fast 与 token 用量均未产生；先前 default/default 只是尚未落实的选择意图，不等于免费小号模型权限已验证。外置验收在目标文件缺失处失败，仓库干净且只有 seed commit，无任务提交、无 worker_done。独立短停止场景 **待测**；只停止了新建协调终端（`stopped: 1`），不冒充 Worker 停止。候选、实验认证、Run/Task、小仓库和外置验收保留。终端中旧 resume 文本不等于执行证据，发现的相关既有进程早一天启动且未动，不据此声称全机模型用量为零。

具体剩余限制：需要先验明匹配 Fork CLI 的候选原生协调者启动与调用者绑定，再核对实际账户默认模型/effort/fast，才有真实 Worker 执行条件；本轮按用户“不承担项目开发”边界止于证据，不作源码修复或新协调终端试验。详见 [实际失败证据](docs/WINDOWS-MANAGED-SMOKE.md)，来源候选文档提交 `f90bc31`、`6116173` 已按序迁入正式分支。

本轮协调用量快照与免费 Worker 用量分开。起点为 21:46:11 用户消息前各会话最后 token_count，均为续段差值，无新 Agent、无 A/B 唤醒、无恢复重置；缓存输入包含于输入、推理输出包含于输出，客户端 token 不是费用，也不代表免费小号的模型消耗。

| 执行者 | 输入 | 缓存输入 | 输出 | 推理输出 | total | 截止北京时间 |
|---|---:|---:|---:|---:|---:|---|
| 总控 / gpt-6-astra high | 5,547,766 | 5,485,440 | 10,077 | 5,077 | 5,557,843 | 21:58:22 |
| 同一环境执行者 / gpt-5.6-terra medium | 5,993,722 | 5,902,592 | 21,768 | 7,208 | 6,015,490 | 21:58:32 |

原始段计数保存在实验 native-run/free-smoke-usage-start.json 与 free-smoke-usage-end.json；快照后的收尾提交/回复未包含。以下旧批状态、登录 pending、PID 和用量保留为时间点历史，以上述当前结果为准。

## 20:35 续批授权：实验系统 home 窄源码与真实运行

21:16 状态：源码、六类针对检查及候选桌面启动已完成；官方实验登录等待用户浏览器确认，真实受管 Worker 与短停止尚未执行。实验 config 已显式设置 `cli_auth_credentials_store = "file"`，依据 [官方认证存储说明](https://developers.openai.com/codex/auth/)；不将 CODEX_HOME 自身当作文件存储模式证明。仅停止了此前本次自有 pending 登录并重启，现保留登录 supervisor `124068`、CLI child `123992`，先前浏览器页面失效。没有复制日常刷新凭证、退出日常账户或切 API 付费。实际认证成功前不得派发模型任务。

残留与失败：候选 Electron `131076`、必要返修会话、实验目录、在用 plugins.sync.lock 和当前 pending 登录保留；未发现候选启动的 OpenDesign 插件/进程，另一个无法明确归属的同名进程未动。不以此声称全局清理。上批 non-check-only 误调用及未知退出码保留，本轮没有再次调用该修复入口。普通提示发送多次返回 agent_prompt_stalled 但实际继续到同一会话，异常保留，不计作新增 Worker 或原生 worker_done。当前全程无新 Agent、无 A/B 唤醒、无恢复重置，候选真实模型任务数为 0。

本轮结束快照（客户端区段计数，不是费用；缓存包含于输入、推理包含于输出）：

| 执行者 / 实际模型 | 输入 | 缓存输入 | 输出 | 推理输出 | total | 截止北京时间 |
|---|---:|---:|---:|---:|---:|---|
| 总控 / gpt-6-astra high | 13,931,660 | 13,650,176 | 29,300 | 9,638 | 13,960,960 | 21:16:11 |
| 同一标准执行者 / gpt-5.6-terra medium | 21,631,830 | 21,171,200 | 81,821 | 23,241 | 21,713,651 | 21:16:09 |

起点取 20:35:43 用户消息前总控最后 token_count、同一标准会话续段起点；只计算本段增量，无计数重置。原始计数保存在实验 native-run/home-override-usage-start.json 与 home-override-usage-end.json，未提交完整会话/认证。快照后收尾提交和最终回复不在表内。

本续批源码已完成并由同一标准执行者集成：候选 `f3f675dc07119c3c4bc299796dee36569043d49a`；其三项提交 `f720e7e` → `816cb98` → `f3f675d` 在正式分支对应 `fd3c5f5` → `4a1e0af` → `b248afd`，均普通 push。起点仍是既有 `64d28fd` 正文候选和固定上游 v1.4.188，不改变 A/B、Kernel 领域或依赖版本。

新增 `ORCA_EXPERIMENT_CODEX_SYSTEM_HOME`，未设置时保留原行为；启用时只允许实核后的 OrcaKernelLab 路径。系统 home、profile 整树及受管 home 的既有链接/越界/读取错误拒绝，不回退日常目录。启动配置先设置经过完整校验的 Electron userData，再规范化环境；runtime-home 构造首行校验。资源同步使用原 owned-copy 流程，会话来源和最终受管 CODEX_HOME 接入既有链路。启动脚本清除继承的模型/会话/运行时绑定和 Electron 测试配置，诊断只打印明确字段。新校验独立到 codex-experiment-home.ts，新增 max-lines 问题已修，未降低规则。

六类检查均有针对证据：默认行为、合法实验来源、非法来源副作用前拒绝、实际子进程环境、会话来源、假认证刷新及配置回写且日常假目录字节不变。六文件组实际 90 通过、3 平台条件跳过；生产 PTY 环境的真实子进程断言 1 通过、23 筛选排除。Node 类型检查、改动文件原 oxlint、CLI 编译和 main/preload/renderer 构建通过。完整 PTY 测试文件中的 WSL cwd 缺失失败保留，不当作全绿；原 18 项 Kernel 静态诊断仍另列。renderer 曾因稀疏工作树缺资源失败，同一执行者只物化当前 HEAD 的 8 个缺失跟踪资源后通过，无资源内容差异/二进制提交。命令与边界见 [本轮证据](docs/WINDOWS-MANAGED-SMOKE.md)。

实际用户流程进展（21:10 回执）：候选 Electron PID `131076`，runtimeId `e61c400d-a1ca-438c-8c9e-1835c65c6494`，匹配 Fork CLI 返回 ready，仅监听 `127.0.0.1:6769` 和 `127.0.0.1:54039`。候选 profile/system/managed 目录已实际创建；官方 Codex 登录仅指向实验 system-home，等待用户浏览器确认。此时认证与会话文件尚未生成，独立受管 Worker 的送达/修改/提交/验证/worker_done 和另一个短停止场景均未执行；这不是 Docker/VM 隔离结果，也不是完整 v0.1。

用户已批准来源入口、必要启动传递和六类针对性检查，取代下面历史中的待批准项。保持当前候选与原 A/B；只复用现有 terra/medium 环境会话（无新 Agent、无重新搭环境），根维护本看板并审关键边界与候选。实施路径限 Codex home / session-source、runtime-home service、必要启动/PTY 接线和对应测试、候选启动脚本与原环境报告；Kernel 领域和原 A/B 文件不另扩。顺序为源码及六类测试 → commit/push 与类型/构建 → 强总控验副作用前拒绝和实际来源 → 同一执行者启动匹配候选 → 一个独立真实任务与短停止。配置无效不回退日常目录，不改全局 HOME/USERPROFILE。认证只用专用实验登录；若不存在则官方登录并由用户确认浏览器，禁止复制 DW 正在使用的刷新凭证。用量另存 native-run/home-override-usage-start.json，按本次用户消息及同一标准会话续段计数。

## 20:10 续批实际收口：依赖通过，启动保护边界未通过

源码仍为 `64d28fdb4834b5f104c9f64be958399f2f9ffe3c`，固定上游仍为 v1.4.188 / `f32ce859047a85a3ea4f507f633604dfbf596a0e`。本续批没有业务代码、依赖版本或锁文件变更。环境证据来自候选分支 `d37cde7063f0a88975017a3acbf82364bd08ca3a`，三个文档提交按序迁入本分支，原 A/B 成果不变。详见 [Windows 实际检查与失败证据](docs/WINDOWS-MANAGED-SMOKE.md)。

- 已核验并解压缓存 Electron 43.1.0 win32-x64 到批准的实验 runtime 目录；已核验 realpath 后复制现有 Orca 的 registry 3.2.2 x64 原生产物到候选专属依赖目录，来源不动、无指回 CURRENT 的新可写链接。二进制只留本机。
- 候选 Electron 执行 `config/scripts/ensure-native-runtime.mjs --check-only`，registry 与 PTY 检查 exit 0。检查使用的 `ELECTRON_RUN_AS_NODE` 已清除。测试用 Electron override 不可作为桌面启动配置；桌面启动前配置和 CLI/runtime 握手未执行，因此不标已验收。
- 桌面启动前停在确定的保护缺口：`getSystemCodexHomePath()` 固定指向日常 `~/.codex`；资源 sync 可创建可写 junction，`writeSystemDefaultAuth` 还可能回写刷新认证。独立 Orca profile 不足以封住这两个来源。候选 profile 未物化，候选桌面 / Run / Task / Worker 均未启动；送达、工作区、改动、提交、测试、worker_done 与短停止场景均未执行。没有 Windows 运行通过、Docker/VM 隔离通过或正式实验结果。
- 执行偏差保留：环境执行者误调一次不带 `--check-only` 的 native ensure，实际进入 rebuild 脚本和 Electron 安装子进程；退出码未保留，不能判成功，也不能声称零副作用。事后 dist/path.txt 仍缺失，检查范围内无新缓存产物、无 Electron/pnpm 残留；不能排除曾发网络请求。未重跑修复入口。
- 本续批只新建一个 terra/medium 环境会话。日常 Orca 的环境 Task `task_e319aa0c67cb` / Dispatch `ctx_8db2ad76f77f` 在 `dispatch_input` 的 `agent_prompt_stalled` 失败保留；源码/环境工作通过普通 status 回执，不冒充候选原生 worker_done。A/B 未唤醒，无恢复重置。必要环境会话已显式 retain。
- 残留：批准的解压运行时、候选 addon、实验用量记录和保留的环境终端仍在。环境会话插件启动曾出现 Open Design 后台服务；其最终存活状态未核验，不将其计为候选资源，也不宣称全部背景进程已清理。未停止日常 Orca。
- 18 项静态诊断仍未通过：12 curly、3 consistent-type-definitions、1 no-useless-escape、2 no-new-array。此次未识别出行为/安全缺陷；原 A 定向机械修复另行处理，两条稀疏数组负例须保留语义。不扩展本轮源码范围。

最小待决定动作已具体化：仅给 `getSystemCodexHomePath()` 增加候选进程显式实验来源覆盖，缺省行为不变，使资源同步和认证回写共同落在实验目录；认证仅使用已有授权的独立副本或实验登录。该窄源码变更超出本轮不扩源码的范围，尚未实施；不请求整套开发重新授权。完成该边界后仍须核验匹配 CLI、启动配置、认证与任务预算，才执行一次独立任务和短停止。

### 本续批用量快照（与 18:39 批次分开）

总控起点为 20:10:57 本次用户消息前最后一条客户端 token_count；环境执行者是本续批新 session，从零计。下表均为区段增量，缓存输入包含在输入内，推理输出包含在输出内；不是账单。无计数恢复重置，无候选冒烟模型 session。原始计数只保存在实验 `native-run/root-usage-start.json` 与 `native-run/usage-end.json`，不公开完整会话或认证。收口文档与最终回复发生在快照之后，不计入表内。

| 执行者 / 实际模型 | 输入 | 缓存输入 | 输出 | 推理输出 | total | 截止北京时间 |
|---|---:|---:|---:|---:|---:|---|
| 总控 / gpt-6-astra high | 4,620,826 | 4,477,056 | 13,276 | 4,945 | 4,634,102 | 20:22:07 |
| 唯一环境执行者 / gpt-5.6-terra medium | 3,200,068 | 3,056,128 | 18,661 | 4,843 | 3,218,729 | 20:21:44 |

以下保留之前的批准、实现和失败历史；其中“本批”与用量表属于各自时间段，不与本续批混算。

20:10 续批授权：批准缓存 Electron 43.1.0 仅解压实验运行时目录、同版本 registry 原生产物仅复制到实核后的候选专属依赖目录。安装前核对 realpath/来源，Electron check-only 核查 registry/PTY；启动前审核 CLI、系统/托管 Codex home、hooks 和会话写入范围。一个 terra/medium 环境执行者，根只审异常/最终证据，B 待命。真实任务限定一次独立完成和一次短停止，不新增收费、不执行 12 次正式实验、不扩服务层。此前“待批准安装”记载保留为历史，已被本次准确授权取代。

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
