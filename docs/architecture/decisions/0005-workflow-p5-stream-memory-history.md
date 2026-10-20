# P5 Local 流式、会话、Store与历史操作

日期：2026-10-19。状态：已实施并通过Local独立技术与无背景体验验收；具体证据、候选继承及边界见P5最终报告。[上位细案](../../../artifacts/archive/document-history-20261020/files/docs/architecture/WORKFLOW_STATEGRAPH_P5_PLAN.md)。

## 决策与复用

继续锁定LangGraph 1.2.15和既有锁文件，不增加工作流框架。图用官方astream的values/custom模式；模型用现有ChatDeepSeek的astream及官方消息块合并，不自写生产LLM流协议。自定义进度由官方get_stream_writer及受限core.progress节点产生，普通stdout不作为可信进度。SDK增量经过权限、脱敏和资源限制，形成既有认证API的事件；State仍在P3检查点事务成功后发布。私有reasoning、原始debug和任意trace／transformer对象不向浏览器开放；并非未经核对遗漏接口。

复用当前有游标的轮询：前台400ms、后台5秒，分页有余立即补读；新增流事件按Run seq与事件ID去重，按step／streamId／attempt分段。P4失败片段不会拼入成功答案；缓存不伪造生成。客户端慢读不阻塞Worker，缺口明确提示并按Run／Step最终结果校准，不承诺保留窗口之外全部token重放。SSE／WebSocket作为未来部署优化重审，Local真实增量不依赖新增长连接Function。

## 资源及保留数值

| 项目 | 本轮选择 |
| --- | --- |
| Thread轮数／期限 | 最多20轮；7天无活动后过期；原P3等待期限及累计policy预算不变 |
| 新轮额度 | 单轮不能超过当前剩余额度；Thread原有节点／工具／计算总限额不清零；分支新Thread受owner队列及每workflow40个近期Thread容量限制 |
| 过程增量 | 每Run最多2048个node类事件／1MiB node类payload；单事件16KiB，超限只记录一次gap并保留正式结果路径 |
| 模型暂态文本 | 每调用最多64KiB，约512字符或200ms批量发布，每片最多2048字符；长答案end不重复塞完整文本，正式结果由Step校准 |
| 秘密分chunk保护 | 保留最长当前秘密长度的尾缓冲，跨chunk核验后才发布；凭据撤销和policy错误原样传播，不归为provider暂错 |
| Store | 每owner／环境最多1000个未过期条目（含版本墓碑）；每项16KiB；TTL为1–10080整分钟，读取不延长TTL |
| 分页／批量 | 历史每页20条、scope列表最多100；Store每页50条、offset最多10000；状态修改最多20项，同一批限同一图scope |
| 新增审计与请求 | 幂等回执24小时、审计7天、过期记忆及7天未执行draft由独立watchdog按5秒周期清理 |
| Run历史 | 最新20条物理清理；不通过Store／请求回执无限复制Run和事件 |

事件限额针对增量类，不丢弃正式步骤／终态／checkpoint提交结果；既有maxEventBytes/maxStateBytes等更小产品限制仍生效。轮次之间不是无限预算；如未来需要独立新增单轮预算，须另行修改累计预算契约并验收，不能默认为P5已支持。

## 长期Store事务与权限

复用已锁定依赖内的官方AsyncPostgresStore，私有workflow_memory schema；官方表结构通过增量迁移建立，Worker运行时不setup／DDL。产品薄适配负责owner／环境hash／workflow私有或显式shared集合命名空间、版本CAS、配额及TTL。普通函数和模型通过长期记忆节点、显式State／输入绑定消费数据，不得到数据库凭据或任意命名空间能力；隔离网络、mount和标准库限制保留。

运行中的put／delete先写私有意图；只有对应准备好的task在超步提交时，通过同一psycopg连接将官方Store写入、意图applied、SDK checkpoint及产品State／步骤同事务提交。失败全部回滚，恢复按同task意图复用；确认前的预测版本不是正式提交。管理页写入独立幂等事务、必须带expectedVersion。删除保存带新版本的有期限墓碑；到期后视为不存在、版本0。

命名空间锁协调条件写与环境总容量；TTL清理与管理请求不回写Thread State。Store分页是当前数据的offset分页，不承诺并发写入中的一致快照；客户端按键去重，写入必须核验当前版本。Thread删除不删除跨Thread记忆，删除workflow仅清其私有Store，显式shared保留。每次受控get／list先清该精确namespace过期行，不依赖异步sweeper的5秒窗口；过期CAS按不存在version0。

## 多轮与历史分支

回应等待／故障恢复沿用P3协议；下一轮仅允许已成功且当前head匹配的closed Thread，创建新Run并递增轮次。草稿不替代冻结定义；每次检查当前授权及编译身份。Run20条清理后保留Thread最小last_run_succeeded资格，不复制旧Run／事件；下一轮和分支保留原Thread可信launch_context，独立Run保持空来源。新增版本与旧P4不兼容时明确拒绝，保留原记录，不自动复活已取消或过期Thread。

所有图把当轮输入存入私有SDK通道，分支取所选检查点输入；不使用Thread最新输入替代。历史读取经认证服务端投影，namespace需能映射到实际子图路径；不开放原始SDK表和任意as_node对象。

原生探针证明SDK bulk可能部分持久化、SDK fork默认仍属原Thread。因此先建立独立draft Thread，官方saver／serde与create_checkpoint克隆完整channel及版本、新checkpoint ID；批量更新全部置于外部DB事务，逐项调用官方状态更新并校验每个完整合并State及大小；中间越界后又恢复合法也整批拒绝，失败不发布副本。产品历史Saver沿用Coordinator的整数channel版本政策，避免与官方Postgres默认字符串版本混用；序列化和保存协议仍为官方。

动态子图按新旧SDK task与定义递归映射namespace，per-thread使用其无taskId namespace；历史child数据上界使用官方历史游标同样的时间有序checkpoint ID，取下一根checkpoint之前的已提交scope head；scope_commits记录即使官方行丢失也保留所需身份，缺失时明确拒绝，绝不回退到更早剩余行。首次发布等待前在同一Run租约下冻结root对应各child的精确head，后续回应或完成不覆盖此历史截面；部分回应可能仍共用原SDK root ID，历史分支按首次冻结等待点重新提问，不把之后的child State混入。新派生副本在官方SDK metadata保存精确child引用，bulk后同步引用，供分支再分支完整性核验；不复制成功receipt。副本从最新配置启动，避免带显式checkpoint ID触发SDK再次time-travel。已提交child工作保留；pending成功receipt／RESUME／interrupt消费不直接复制，部分任务会重新提问，预览说明。混合多个scope的同批修改和非pending child更新明确拒绝，避免调度含糊；同scope单改／批改与嵌套待执行子图受控更新纳入验收。

原历史只读。显式确认后才执行分支；读取当前授权Store，不回滚外部世界。prepare与正式branch.start均重新检查同owner可访问的完整parent谱系；存续来源有不确定写效果时阻止新的重放。已删除来源按最小独立分支规则停止遍历。正式启动在同一SQL事务先返回已接受的同键回执，再核验新请求，避免将幂等重发当作新执行；秘密/当前授权仍先校验。实际模型／外部工具重新执行可能产生新费用／效果，预览展示后续节点及说明；确认不替代效果未知保护。

## 代价、备选与重审

轮询复用现有Function和客户端补读，代价是前台请求频率及约400ms采集间隔；同库Store事务减少协调协议，代价是Worker要有私有schema访问且提交持锁；历史副本事务保证批量发布原子性，代价是需受控namespace克隆和有限draft容量。Hosted、多Worker持续负载、语义检索、历史Store快照、跨scope混合批次或SDK升级时，先重审ADR、限额和对应故障／权限用例。

参考：[官方流式](https://docs.langchain.com/oss/python/langgraph/streaming)、[持久化](https://docs.langchain.com/oss/python/langgraph/persistence)、[时间旅行](https://docs.langchain.com/oss/python/langgraph/use-time-travel)、[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)。当前SDK具体行为以本轮锁定版本原生对照为准，不以最新网页替代版本证据。
