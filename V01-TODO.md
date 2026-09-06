# Orca-Kernel v0.1 唯一执行看板

本看板从 [Multi-agent-kernel 的已交付基线](https://github.com/songconmaisaix31-design/Multi-agent-kernel/tree/08d1ff6b8f2a0df4cce538213d7943508a18e5d2) 迁入，沿用当前总控、A 规则轨及 B 接入轨；不是重开规划。旧库保留来源历史并只指向此处。

正式开发库：[公开 Orca Fork](https://github.com/songconmaisaix31-design/orca-kernel)。复用账号已有 Fork，父仓为 stablyai/orca。固定 U=`f32ce859047a85a3ea4f507f633604dfbf596a0e`；`git ls-remote` 实测 v1.4.188 tag 对象为 `8e9d661e4f515b17a90e6916ab193367f09f42e9`，解引用为 U；本地 HEAD 亦核实为 U。未升级 main，未改旧库可见性、许可证或历史。

## 当前批次与文件责任

唯一目标：把首批 validatePlan 接入上游真实受管派发服务。合法进入原生 workerStart；非法在执行资源创建前拒绝；关闭模式保持原生；未支持的受管低层/远端路径明确拒绝。先交付服务层证据，不冒充真实 Worker 验收。

| 轨道 | 固定 Worker / 文件责任 | 当前状态 |
|---|---|---|
| A 规则 | 原规则 Worker；Worktree kernel-v01-rules / Branch songconmaisaix31-design/kernel-v01-rules；src/main/runtime/orchestration/kernel-plan.ts、kernel-plan.test.ts | 将来源 5d2f78d9077a8a14abe20a1136e3c83a4955773c 的实现及 121 条 Node 测试迁到上游 Vitest；Plan 字段与语义保持 |
| B 接入 | 原接入 Worker；Worktree kernel-v01-integration / Branch songconmaisaix31-design/kernel-v01-integration；Run types、kernel-run-config、DB schema/migrate/constants、RPC orchestration-runs/workers/orchestration 、orchestration-kernel-admission.ts、DB worker-dispatch-start / dispatch-context-store 与相邻接入测试 | 实现服务端持久化配置、协调者权限、派发检查及真实 DB/handler 测试；不写 A 文件 |
| 总控 | 本看板、来源记录、验收；唯一环境执行者 | 固定源码和依赖准备、隐私检查、验收及远端核对；不写业务代码 |

每轨一个正式 Worktree 和 Branch；旧终端仅保留原会话作为宿主，实际读写必须显式指定新工作目录。开发、测试、返修由原 Worker 持续承担并 commit + 普通 push。两轨完成后由一个集成 Worker 合并，领域失败退原 owner。

共享契约归 A：Plan schemaVersion/objective/nonGoals/baseCommit/tasks，任务 key/owner/writePaths/dependsOn/acceptance/escalateWhen。B 复用类型；原生 Task 绑定采用 task.key=真实 Task ID 并核对 Run 归属。Run 增加可空 kernel_config={repoId,plan}，NULL 为原生。协调者通过 runUse 可选 kernel 配置；省略不修改，显式 null 关闭，有活跃派发时拒绝变更。已启用配置损坏不能降级为原生。初版仅支持本地 Git new-top-level，其余受管路径明确拒绝。

## 证据与关卡

首批来源保留：规则 `5d2f78d9077a8a14abe20a1136e3c83a4955773c`；接入研究 `ad997b786f451a6e3fea444b52a601c8b0c6ed33`；原组合候选 `6e3c43df333630bc5b156b1873f01d0e78357c28`；旧库接手 HEAD `08d1ff6b8f2a0df4cce538213d7943508a18e5d2`。旧库 Node 24 测试 121/121 的结论仅适用于原纯规则。

| 关卡 | 真实状态 |
|---|---|
| G00 现状保护 | 已核实历史和旧工作区，既有成果保留；其余保护验收不自动刷绿 |
| G01 Fork/U | 已复用公开 Fork，固定 Git tag/HEAD 已核实；CURRENT 精确复现仍留后续 |
| G02 上游技术冒烟 | 源码类型检查/测试待本批运行；未做源码真实 Worker |
| G03 隔离 | 未通过。Docker sandbox EPERM、专用 WSL 共享挂载两条失败路径停止重试 |
| G04 CURRENT | 正式复现与实验规格验收未完成 |
| G05 契约/开关 | 首批纯规则已通过；本批迁移/类型检查/受管设置执行中 |
| G06 派发/交接/停止 | 本批受管派发服务接入执行中；真实 Worker/结果/停止未通过 |
| G07 验收/整合 | 本批源码合并待执行；产品候选接纳/依赖进入起点未实现 |
| G08 回归闭环 | 未完成 |
| G09 两组实验 | 12 次未执行 |
| G10 交付决定 | 未到真实 v0.1 放行条件 |

测试必须通过上游 config/vitest.config.ts 实际发现/执行；新模块进入 config/tsconfig.node.json 的真实 TypeScript 检查。真实 DB/handler 测试可替换终端资源边界，但必须标明不是真实 Worker。完整 test/build 未执行时明确保留限制。

## 持续有效边界

CURRENT 仍为 Codex 内置提示词＋长期记忆＋提示词钩子＋Orca 1.4.188 基础设施。主对照仅 CURRENT 与 KERNEL，2 类任务×2 组×3 次=12 次；不找 Kit.zip、不增第三套 Orca 实验。保留上游回归冒烟，但不把它作为第三比较组。

既定项目、实验目录和已有预算内的开发、测试、返修、commit、普通 push 与集成无需逐关审批。环境、认证和正式实验预算不阻塞无依赖源码；G00 未通过不冻结全项目。仅不可逆操作、提权/重启、权限扩大、新增收费/超预算及重大产品决定请求用户确认。公开 Fork 已获明确授权。

不建设新调度器、运行时、消息系统或工作台；不改日常 Orca/.codex/记忆，不降级 sandbox，不启动未通过隔离的模型实验。唯一环境执行者为总控；保留已有失败现场，不重复 Docker/WSL 路线。原始需求、CURRENT 正文和环境历史按旧库固定 SHA 链接留存，不把完整记忆或认证材料迁入公开 Fork。

## 当前批次新增实证

- 正式 Fork 基线分支 `kernel/v01-upstream-base` 已由 GitHub 返回 U，并经 git ls-remote 独立核实；文档分支 `kernel/v01-managed-dispatch` 的迁移提交 `c3e8bdce8a92bb041562437cf5db48d5dcf9b512` 已普通 push 且远端一致。Fork 原 main 保留。
- 旧库指向迁移提交 `68e84c6f22b50676ab8a964af0a7b8dbb1223fd5` 已普通 push、远端一致、工作区干净；08d1ff6 仍为祖先。原 G00/CURRENT 正文逐字节保留，仅加归档声明；原完整手册在固定首批 SHA 可读。
- A 迁移提交 `7a2e4db8727ab0a8af4745a2f31a2be9219f3ffc` 已普通 push、远端一致。validatePlan 的 Git blob 与 5d2f78d 来源逐字节一致；测试仅切换 Vitest 注册和同目录导入。上游 config/vitest.config.ts 实际发现 121、执行通过 121；严格单模块 tsc 7.0.2 通过，完整项目配置检查仍待源码补齐，不把局部检查当全仓通过。
- 环境只准备实验开发 Worktree 的 Node 24.16.0 / pnpm 10.24.0，采用 frozen-lockfile + ignore-scripts；A/B 各有独立 node_modules，复用下载缓存。上游 LICENSE、package.json、锁文件和根工程配置未改。未执行 Electron/native 生命周期、日常运行时启动、Docker/WSL 重试或模型实验。
- B 已写入受管配置和派发服务，在现有事务内复核策略；测试包含真实 handler、SQLite、真实调用者证明校验器，并替换终端/资源观测边界。尚待实际运行结果，不计真实 Worker 通过。