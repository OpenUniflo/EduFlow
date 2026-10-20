# ADR 0006：P6 仅使用 Vercel 与 Supabase 托管

日期：2026-10-19。状态：实施完成并完成规定范围Hosted实测；正式独立签署见P6交付报告与44项矩阵。用户明确要求不使用独立服务器，取代 P6 原方案中尚未冻结的服务器承载假设。

## 部署决定

前端及认证 Node API 保留 `edu-flow` 项目。Python Compiler、一个 Worker 与独立 watchdog 部署到 `edu-flow-workflow`（`prj_tDaQ3riDUpFHggr8rtBye9jJcFyd`），通过 HTTPS 与服务端令牌连接。两个项目分别冻结源码和构建；前端每部署现有12个API入口，后台一个FastAPI Function；最终以真实生成产物核验，不以目录计数签署。

Worker/watchdog使用[Vercel Daemons](https://vercel.com/docs/daemons)公共Beta，由平台监督，各一个sin1实例、1Gi内存；Worker配置termination宽限660秒，watchdog独立进程。真实活跃跨promote曾失联，配置不等于无损排空保证；最终采用暂停两个owner提交、自然排空并全局preflight后发布的受控维护流程，非开放流量原子维护闸。Beta仅Production运行，因此后台验收目标为该项目Production；前端的实际发布环境与URL另记，不能把Preview证据泛化为所有Production。不使用SSH、独立服务器、反向隧道或开发机常驻进程。

Supabase项目为`uyljtdbvlivxniililay`、ap-southeast-1。持久执行使用受限`workflow_worker`角色和SSL session pooler；正式门槛需实测官方Saver/Store、search_path/options、事务/CAS而非只测select。PGMQ、checkpoint、Store、权限、环境变量和函数目录保留已有权威。新增私有操作信号与发现目录供跨实例共享，不把临时文件当Hosted权威。发现目录最多128条、单条256KiB；事务锁保护并发新增配额，已有条目可更新，超限明确拒绝，由运维按实际被撤销版本精确清理，不自动丢弃有效连接。

隔离执行使用官方`vercel-sandbox==0.9.1`及`vercel-oidc>=0.10.0`薄适配，避免引入无关Workflow/Queue框架。镜像固定amd64 Python3.13+Node24，原始base digest和构建记录留证，实际执行固定VCR digest。每次新VM deny-all、persistent=False、无业务/平台凭据；平台40秒以内到期兜底；VM内用cgroup限制256MiB、0.5CPU、32进程，mount/PID namespace、只读根、16MiB tmpfs、无sudo的65534用户与no_new_privs及文件/输出限额。任一步限制失败则拒绝执行，不降级到宿主运行。Local仍用原Docker适配；两者分别验收。

Vercel Sandbox/Daemon均有Hobby配额；完整交付记录实际用量和可用性，不宣称无限容量。项目独立避免新Python入口挤占主项目Function预算，也避免为此重构课程/材料等领域API。

## 固定验收规模与目标（Hosted产品测试前冻结）

- 一个Worker、一个watchdog；2个授权owner；受控负载为4个同时提交的短流程，各不超过10节点、不含外部模型等待，重复5组（20 Run）。独立性能表记录实际每次耗时，不把少量样本当生产容量证明。
- API提交/状态读取p95≤8秒（至少20样本）；空闲Worker首任务排队≤10秒，四任务组中单项排队≤40秒；事件发布至前台可见p95≤3秒（至少20样本）。真实外部模型延迟单列。
- 取消请求至无后续提交≤10秒；失联发现与封闭≤40秒（30秒lease+5秒watchdog及网络余量）；服务重启恢复接新任务≤120秒。失败Run仍由用户显式恢复，非自动接管。
- 稳定性观察≥15分钟：每分钟读健康、持续短任务及清理可运行，无未解释5xx、无资源无限增长；配额与网络故障单列。20Run均具唯一身份，无跨owner数据。
- 备份恢复到隔离环境≤15分钟，以冻结快照为RPO（快照内记录0丢失）；不宣称连续PITR能力。归档JSON恢复与完整相关schema/数据恢复分别留证。
- 真实模型成功调用预算最多6次、每次最多512输出token；HTTP/MCP至少各一许可真实读，故障大量重复由受控端点完成；Sandbox专项VM每次≤40秒且精确清理。超额须先减少重复验收，不能悄悄无限调用。

## 旧数据与升级顺序

Hosted迁移初查有40条Local-only、remote-only0；旧workflow_runs0、user_workflow_definitions0、user_workflow_state3、workflow_templates20。已将迁移前public schema及public/auth数据备份到权限受控的忽略目录；原始内容不进入公开报告。

原统一工作区迁移会退役旧表并替换模板，因此先应用原6条基础迁移建立依赖，再应用新的私有Legacy归档/范围修复迁移，最后`--include-all`补其余待应用版本。源SQL原样复制到临时工作目录执行前置批次，不修改已应用历史；每次dry-run对账。归档初次锁表并装变更触发器同事务，捕获迁移前仍发生的旧写入，完整JSON+SHA保留；anon/authenticated/service_role/worker均无归档访问。归档仅供受控运维恢复，不是Legacy运行fallback。课程模板稳定ID和学习数据另做保护读回。

P3–P5所有明确限制继续有效。执行器变化使旧Local指纹不兼容时保留原历史并明确拒绝，不静默升级；Hosted原先无V2活跃Run。发布/回退按两个项目的兼容候选成对管理，不能让旧Worker误领新候选任务。实际验证、故障、回退和最终结论见后续P6独立报告。

## 实施修复与偏差记录

- 首轮独立UX发现可继续会话误标结束、取消步骤误标失败、无安全检查点仍给恢复按钮、编辑入口仍只读，以及实时输出位置过低；只修复对应文案、默认选择、导航和面板顺序，未改画布设计或布局模型。
- DeepWiki输出Schema带`x-fastmcp-wrap-result`扩展注解。前后端统一接受`x-*`元数据并完整保留指纹，官方JSON Schema/AJV仍验证实际类型和required；pattern等原拒绝断言没有开放。真实MCP调用复验通过。
- 一次Sandbox重试第二attempt基础设施不可用；原记录保留，同冻结定义新Run恰两attempt复验通过。尚未证实平台根因已修；补固定stage、异常类、diagnostic ID与Run/Step关联，禁止SDK原始异常和秘密进入日志。
- 技术模型组合因验收脚本子图误用30秒预算而两次超时；无delta不等于无计费。为纠正脚本，仅补2次、每次最多256输出token，实际调用上限6调整为8，原偏差保留。没有放宽质量、延迟或恢复门槛；合成协议fixture不冒充真实模型调用。
- 临时Vercel计数/合成流项目只验证实际外部写后丢回应、Vault与跨chunk脱敏；专用SQL和目录项验后精确移除，不是运行fallback。

- I05真实受控写在SDK节点deadline时绕过外部效果重试门槛，首轮计数实际0→3；现将可能写外部的NodeTimeoutError统一标为unknown，禁止retry和handler，已在新Hosted候选实际复验计数0→1。只读/纯计算timeout仍保持原许可策略，原失败与预算消耗不删除。
- 凭据轮换后新/旧内部令牌与新/旧SSL连接分别验证。旧后端不可变部署仍可能接受旧服务身份，因此精确删除本轮新建后台项目的旧发布；匹配400b历史检查点的固定VCR镜像另行保留供受控恢复，不保留旧授权HTTP入口。
- CLI --local-config指向临时别名文件时未实际改变Daemon配置；故障配置必须暂写项目规范vercel.json，使用其绝对路径发布，finally恢复工作区文件，并读回平台Daemon配置后才开始计时。

- 为满足清理临时目录与凭据后“四个保留示例仍能真实运行”的既定门槛，最终仅额外运行一次既有并行示例（2次真实模型调用，每次上限512输出token）；总硬上限由8调整为10。记录开始前建立不可覆盖ledger，任何失败先核对Run，不自动重发或继续扩张预算。最终已用数量以实际Run/Step读回为准，不把该计划上限当已发生调用。

- 独立验收指出旧Storage连接与全表清理无明确上限；新迁移将专用角色SQL/锁等待限制为15秒/3秒，所有Runtime连接5秒、TCP未确认数据20秒。watchdog只挑选可处置Thread且单批128，过期集合各批128、skip locked，保护活跃记录；新增129条过期与有效数据的实际回滚事务测试，不用风险声明代替有界门槛。

- 新迁移后实际session pooler新连接仍显示statement2min/lock0，证明仅ALTER ROLE不足以约束现有池。所有Runtime/Saver/Store/ready连接改为显式官方libpq options（保留SDK search_path），再以真实会话SHOW与锁等待复验；首轮未生效证据保留。

- 失联预备Run在停止前先以SandboxCleanupError失败，不能代签WORKER_LOST；原Run/时间/日志保留。官方context stop→destroy与独立reaper立即destroy stopped实例存在源码可见竞态，但原日志缺cause，不能确证原错误是404。现让正常context有5秒回收宽限；重复destroy404/410幂等；仅当已有有效纯代码结果、cleanup404/410且再次SDK查询确认目标已不存在/已deleted时接受结果。500、仍running或确认失败仍明确失败；补cause类/HTTP状态安全诊断及4项测试。新失联验收采用预构建停用版本快速promote，避免构建时间错过活跃任务。

- 984失联显式resume已受理后，curl轮询遇Vercel系统challenge403/HTML；通过精确Thread/Run只读查回success且没有重复POST。无AttackMode/自定义阻断，现有automation身份和官方curl未消除系统挑战。正常headed Chrome自然完成JavaScript校验后继续技术API传输，应用Bearer/权限不变；未伪装UA、复制cookie、解决验证码、换域或关闭防护。技术报告区分原curl与浏览器客户端指标，单次1秒轮询且无自动写重发。

- 最终复核补回收任务总界限：SDK page_size不是总批次。回收单轮最多检查20对象/尝试删除5次（含404/410）、4秒超时，与DB五秒巡检分成独立async任务；慢SDK测试证明DB第三次巡检在回收超时前完成。失败不续healthy信号、不暂停Run封闭；最终SDK d576候选另做真实stopped自建VM自然回收和正常15分钟观察。984 run_code路径/六VM/真实失联结果按未改代码明确继承。

- 最终逐项审查发现I06已有Store提交后的真实停机，但未覆盖模型正输出时停机；补充独立临时Vercel受控SSE服务，经实际官方模型SDK、Hosted事件管道，首增量后真正promote到Worker0/watchdog1。该服务不调用收费模型，不计入H04真实提供方证明，验后删除。首次失联29.092秒、旧流无结果提交且游标可恢复终态；其恢复被冻结fixture的maxAttempts=1正确拒绝。保留该失败，仅新fixture预留2次尝试复验，未更改产品预算逻辑或旧定义。
- 原离线镜像首次导出仅8704字节索引、缺完整layer，独立验收拒绝‘可离线恢复’结论。现从匹配400b固定VCR镜像物化完整文件系统，再导出126620160字节含config和layer的恢复镜像；新Docker身份及原VCR来源分别记录。独立6/6核验SHA、压缩层与diffID，并在禁止拉取、无网络、只读及去能力条件下实际执行旧资格。该镜像用于匹配旧快照读回，不冒充当前d576或原镜像相同Docker ID。

- 终审补齐registry四处及Vault秘密读取一处同步连接的显式connect5秒/TCP20秒/SQL15秒/lock3秒；此前角色默认值不可靠的发现同样适用这些路径。最终执行器因此为85667e772de6f94f2d84e27b9da0528c7903ff44480fbbbde871d6d0bc607728，209工程、28核心、4真实连接和5实际同步连接点均重新验证；d576未变的流/Worker故障机制按明确范围继承。
- 直接带活跃15秒纯计算promote虽实际配置660秒宽限仍发生WORKER_LOST，原因未确认，原失败保留。修复发布程序为受控维护：两个授权owner停止新提交，任务自然终态，受限全局queued/running preflight非0或读失败即拒绝且不调用promote；normal先skip-domain构建再守卫提升。实际忙时返回42/不提升，同一Run随后total7成功，再提升B，双等待身份保留且回应total10。该方案不是原子admission gate，不承诺开放流量自动安全发布；不把平台配置或理论SIGTERM处理当实测保证。
- 清理专项采用执行前已固定的15次、每次间隔2秒观察（SDK网络RTT另计，不谎称严格30秒端到端上限）：真实stopped自建VM由Hosted独立watchdog自然删除9.915秒，无手动fallback；移除精确测试清理失败trigger后数据库自然重试3.333秒。数据库每集合128行/5秒巡检，回收最多20对象/5次删除/4秒独立任务的界限保持，不事后放宽通过阈值。
- I01最终保留并行例以普通认证保存新修订2：Send两个任务，各进入worker→analyse两层子图，真实双模型逐步输出，再由messages Reducer和defer collector汇合。原修订1及其UX历史保留；新模型运行使用此前已明确的最后2次预算，不把原一层子图测试冒充完整两层组合。
- 最终无背景只读复验发现并行rev2风险答案仅半句，虽技术运行/双流/归属通过，但不满足该修订可见的三点业务内容要求；原因未确认，原Run、原文与体验失败证据均保留。仅普通保存新rev3，拓扑/SDK/环境/源码不变，显式改为带“成本：”“风险：”主题的各一句≤25字短结论并补中文标签；不把旧三点分析改判成功。为交付可用示例，真实模型总调用上限在新调用前由10增加为12，仅该例唯一新Run的2次，每次仍≤512输出token，无自动重试或盲重放。先完成原15分钟纯短任务窗口，再执行该Run；不能声称窗口是在rev3业务答案上观察15分钟。
- 独立只读取rev2自有检查点的最小SDK元数据确认：成本finishReason=stop/output317（reasoning247），风险finishReason=length/output514（reasoning493）；不读取/公开原始reasoning。故可记录长度终止与半句结果，但未抓原始wire，不能确定配置512与SDK报告514之差的根因。全篇512指请求配置cap，实际SDKusage另列，不能宣称所有真实计量均≤512；预算偏差保留，超时/取消也不按零费用处理。rev3保持同512请求配置，最多追加两次后总上限12，不自动扩张或重放。
- 历史预算再核：首轮composition的child除误用30秒外，还沿用了base请求maxOutputTokens2048；该批两次超时、无delta，仍不能当作无费用。纠正补偿批明确child120秒/256。最终目标及rev3请求512的措辞不覆盖这一已发生偏差，不宣称本轮全部历史请求均≤512；无需为修正历史再次调用模型。
- rev3仍实际出现成本完整、风险空正文，SDK元数据为stop/output232(reasoning223)与length/output512(reasoning512)。现确认产品遗漏SDK终止原因检查：聚合后无条件computed。修复为官方SDK消息finish_reason=length明确MODEL_OUTPUT_TRUNCATED，非成功终止明确失败，无正文且无合法toolCalls明确EMPTY_MODEL_RESPONSE；合法空正文toolCalls保留。失败流标interrupted，不把部分内容提交为成功，不按标点/关键词判语义。原rev2/rev3失败结果保留。
- 为避免短例重复消耗默认思考预算，依[官方DeepSeek参数](https://api-docs.deepseek.com/guides/thinking_mode/)及现有ChatDeepSeek.extra_body薄适配，新增严格modelParameters.thinking={type:enabled|disabled}，省略仍保留提供方默认。既有高级节点参数可编辑，不改前端设计；最终新rev4例显式disabled、请求cap512。先修复并重新冻结部署，再仅一次Run两次真实调用，总硬上限12→14；不自动重试，不继续靠缩短问题碰运气。旧8566的906.933秒/16样本稳定观察保留为旧源码证据，新源码另作完整15分钟观察，禁止冒用。

- 最终7b65执行器、675文件manifest及兼容A/B正式身份见交付报告；独立复验核心28、HTTP/MCP4、SDK7、LocalSQL2、rev4技术5与普通UI通过。唯一rev4真实模型Run的两份答案完整，SDK stop且输出10/14；全批7Run/14唯一模型Step开始经独立4项核账。末批11defs/1function/2Store精确清理，4例/原45Thread保留；新源码完整窗口904.813秒/16样本全成功，旧8566窗口不代签。未提交或推送。
