# Orca-Kernel v0.1 唯一执行看板

本看板沿用当前总控、原 A 规则 Worker 与 B 接入 Worker；从 [首批成果](https://github.com/songconmaisaix31-design/Multi-agent-kernel/tree/08d1ff6b8f2a0df4cce538213d7943508a18e5d2) 迁入。旧库仅保留历史和开发位置指针，不维护另一份活跃计划。

正式仓库：[公开 Orca Fork](https://github.com/songconmaisaix31-design/orca-kernel)。复用账号已有 Fork，父仓及 source 均为 stablyai/orca。固定起点 U=`f32ce859047a85a3ea4f507f633604dfbf596a0e`（v1.4.188）；tag 对象 `8e9d661e4f515b17a90e6916ab193367f09f42e9`，解引用与 U 一致。U 是当前开发历史的祖先，不是当前 HEAD。Fork 原 main 保留；未升级到最新 main，未改旧库可见性或历史。

## 本批交付和所有权

唯一目标已完成到服务层：validatePlan 接入真实受管派发入口，合法进入原生 workerStart，非法在执行资源创建前拒绝，关闭模式保持原生，未支持的受管低层/远端路径明确拒绝。实际运行条件仍单独列明。

| 轨道 | 固定工作区 / 分支 / write_paths | 已交付 |
|---|---|---|
| A 原规则 Worker | kernel-v01-rules / songconmaisaix31-design/kernel-v01-rules；src/main/runtime/orchestration/kernel-plan.ts、kernel-plan.test.ts | `7a2e4db8727ab0a8af4745a2f31a2be9219f3ffc`，已 push；实现与来源逐字节相同，121 条测试转为上游 Vitest |
| B 原接入 Worker | kernel-v01-integration / songconmaisaix31-design/kernel-v01-integration；Run types、kernel-run-config、DB schema/migrate/constants、worker-dispatch-start、dispatch-context-store、RPC orchestration-runs/workers/orchestration、orchestration-kernel-admission 及相邻测试 | `8c4f3045771e98014cf56709086b786fcb74eb0c`，已 push；13 个 B 文件，不修改 A 的 2 个文件 |
| C 唯一集成 Worker | kernel-v01-candidate / songconmaisaix31-design/kernel-v01-candidate；只做合并和验收，领域问题退原 owner | `0c4286d722342d0a2155a1e6d2e7c5637c94f61a`，依次合并 A/B、复验并 push；没有业务胶水改动 |
| 当前总控 | kernel/v01-managed-dispatch；本看板、来源和验收记录；唯一环境执行者 | 快进接纳受测候选，更新交付记录并普通 push；不写业务代码 |

同轨开发、测试、返修仍由原 Worker 负责。A/B 旧终端保留原会话，实际工作目录显式指向正式 Fork 的独立 Worktree。C 的两次原生派发回执因 agent_prompt_stalled 保持 failed；同一个 C 通过普通 CLI 交接完成源码复验，没有伪造生命周期成功，也没有重复创建集成者。

共享契约仍归 A：Plan schemaVersion/objective/nonGoals/baseCommit/tasks，任务 key/owner/writePaths/dependsOn/acceptance/escalateWhen。B 绑定 task.key=本 Run 真实 Task ID，并核对原生 Task 依赖。Run 的可空 kernel_config 持久化 {repoId,plan}；数据库从 schema 29 加性迁移至 30。

当前协调者通过真实 `orchestration.runUse` RPC 的可选 kernel 配置：省略不修改，显式 null 关闭；活跃派发、未知运行状态或未释放终端资源存在时拒绝变更。权限使用原生调用者证明和当前协调者校验，损坏/未知配置不能降级为原生。仅支持本地 Git new-top-level；其他受管路径明确拒绝。异步准备后和原生 DB 事务内再次核对，避免配置/任务变化漏管。

## 验收证据

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

本批只提供 RPC 配置接入，没有新增 CLI 开关/UI。原生 Task completed 只保证原生依赖状态，不等于 Kernel accepted/merged。词法路径验证不是磁盘写入沙箱，不证明 symlink/junction、真实提交存在性或候选差异合规。全仓所有 Vitest、完整桌面构建、真实 Worker 和正式模型实验均未执行。本批源码成功不能代替这些验收。

## 来源保留与持续授权

首批来源：规则 `5d2f78d9077a8a14abe20a1136e3c83a4955773c`；接入研究 `ad997b786f451a6e3fea444b52a601c8b0c6ed33`；原组合候选 `6e3c43df333630bc5b156b1873f01d0e78357c28`；旧库接手 HEAD `08d1ff6b8f2a0df4cce538213d7943508a18e5d2`。旧库指针提交 `68e84c6f22b50676ab8a964af0a7b8dbb1223fd5` 已 push，08d1ff6 仍为祖先，工作区干净；原 G00/CURRENT 正文完整保留，仅加归档说明。

CURRENT 仍为 Codex 内置提示词＋长期记忆＋提示词钩子＋Orca 1.4.188 基础设施。主对照仅 CURRENT 与 KERNEL，2 类任务×2 组×3 次=12 次；不找 Kit.zip、不增第三套 Orca 实验。上游回归冒烟不是第三比较组。

既定项目、实验目录和已有预算内的开发、测试、返修、commit、普通 push 与集成无需逐关审批。环境、认证和正式实验预算不阻塞无依赖源码；G00 未通过不冻结全项目。仅不可逆操作、提权/重启、权限扩大、新增收费/超预算及重大产品决定请求用户确认。

不建设新调度器、运行时、消息系统或工作台；不改日常 Orca/.codex/记忆，不降级 sandbox，不启动未通过隔离的模型实验。环境至多一个执行者，即总控；不重复已证实失败的 Docker/WSL 路线。后续继续沿此唯一看板和原 Worker 推进，不另建活跃规划。
