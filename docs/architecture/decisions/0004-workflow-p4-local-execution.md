# P4 Local 节点执行与策略边界

日期：2026-10-18。状态：本轮实施采用，实际通过范围以[P4独立验收](../../../artifacts/archive/document-history-20261020/files/docs/acceptance/p4-technical-independent.md)为准。上位范围见[P4细案](../../../artifacts/archive/document-history-20261020/files/docs/architecture/WORKFLOW_STATEGRAPH_P4_PLAN.md)。

## 隔离执行

Local复用Docker Desktop的Linux VM与OCI容器，不在API或Python Worker宿主执行用户源码，不引入另一个工作流调度器。宿主子进程仅调用固定参数的Docker CLI；源码与输入通过受限stdin JSON传入，不传shell参数或挂载目录。Hosted需要单独选择和验证其隔离部署；本ADR不证明生产多租户内核隔离或任意内核漏洞防御。

镜像固定为：

- Python：`python@sha256:f6a589d43c42b9e7f7dc67a12d37132491f362859a5d750607710cc56da3bc72`。
- JavaScript：`node@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402`。

只使用各镜像标准库，不运行安装命令。通过`docker image inspect`核对本地镜像；缺失明确报不可用，不回退宿主执行。运行时实际版本随验收证据记录，镜像标签不作为身份。

容器以65534:65534运行，全部capability移除，no-new-privileges，Docker默认seccomp，只读根文件系统，network none，无宿主mount／Docker socket／运行凭据。限制256MiB内存且不加swap、0.5CPU、32个PID、16MiB noexec/nosuid临时目录、64个文件描述符、16KiB单文件、64KiB每输出流；源码加输入／Context不超过128KiB，源码32KiB。每个隔离调用最长30秒，节点／整图可有更短上限。

stdout／stderr在读取过程中限量；报错、取消和超时均强制移除容器并排空／关闭CLI读流。容器内部timeout提供独立期限；另带宿主生成deadline标签，独立watchdog在期限加10秒容差后按5秒周期回收，覆盖Worker失联或容器内计时器被停止的场景。watchdog与Docker daemon是Local运行前提。仅按专用标签和精确容器身份清理，不触碰Supabase或其他容器。

依据：[Docker seccomp](https://docs.docker.com/engine/security/seccomp/)、[Docker资源限制](https://docs.docker.com/engine/containers/resource_constraints/)。组件层探针与产品API的实际限制分别验收，不互相替代。

## 函数和用途

普通函数与错误处理器发布到owner／environment隔离的私有目录，版本不可改写；停用为明确授权变更。用户函数始终进入隔离环境，接口为`process(input, context)`，结果为JSON对象。源码、Schema、用途、版本及固定镜像进入执行身份。内置`edu.scale@1/@2`为受控发布的数值缩放节点函数。

`purpose:node`与`purpose:handler`不同；节点不能使用处理器，处理器不能使用普通节点函数。处理器输入是`{error:{code}, input:原节点解析输入}`，结果映射为原节点输出；保留原始失败及处理器轨迹。可信路由判断独立使用`op:function`、`edu.positive@1`或`edu.truthy@1`及value Binding；不接受普通函数的引用替代判断契约。可信Reducer由代码发布目录注册`edu.sum@1`、`edu.max@1`、`edu.unique@1`，不动态执行任意用户Reducer源码。

添加无关函数版本不改变环境授权revision；编译指纹只加入当前图实际引用的函数／处理器版本。恢复和执行中guard仍核验当前版本是否可用。Context仅含服务端生成的owner／workflow／node／graphPath及当前attempt，不含整个环境、连接凭据或产品实体。

## SDK 策略与产品提交

P3外层图继续拥有task、namespace、interrupt、step、receipt和超步事务。处理节点内部使用SDK StateGraph执行retry、timeout、CachePolicy、error_handler；该内部图不设checkpointer，使用async durability，持久边界在外层父任务。外层权限、输入解析、step启动、结果Schema、原始patch、租约及提交检查均不被缓存跳过。

每次实际计算先通过私有SQL按thread/task累计attempt，恢复不能重置；重试最大次数包含首次执行。首次计算已由begin_task扣节点预算，其余尝试及处理器另扣预算。模型SDK重试继续为0，HTTP transport不另重试。退避和实际计算计入整图计算上限，业务等待沿用P3期限且不计计算时间。

重试分类显式选择rate_limit／provider／tool／code／timeout；auth／policy／validation／infrastructure和effect unknown不会重试。处理器也不能把上述拒绝或不确定外部效果转换为成功。SDK handler仅更新内部compute输出，外层原节点完成后继续原控制流，不依赖SDK失败节点自动激活静态后继。

超时采用SDK协作取消，CPU密集用户代码另受Docker限额和期限控制。父任务guard轮询会发现取消、租约丢失、累计超时、连接或函数授权变化；取消后不得迟到提交。远程已经发生的写入保留不确定性，不承诺撤销或通用exactly-once。

## 缓存与状态

官方InMemoryCache为Worker进程内结果缓存，重启后失效；不是Store或检查点。TTL在UI/API只接受1–3600整秒；最多512条，达到上限清空。键覆盖节点配置、解析输入、安全Context、授权环境revision及编译身份，按owner隔离；不含裸凭据。并发相同输入允许重复计算，不承诺single-flight。

仅纯函数与确定性转换可配置缓存；不允许模型／工具、控制流、子图整体，以及含业务等待、Command或处理器的节点。命中仍生成当前外层task记录并通过权限及输出校验；旧task身份不复用，原始patch只提交一次。已有的编译计划LRU和节点结果缓存分别观测。

显式覆盖在SDK通道使用Overwrite，候选值通过同等Schema校验；同超步重复覆盖报冲突。shared子图的raw-patch回传尚不携带覆盖语义，因此其内部显式覆盖明确预检拒绝，不静默退化成Reducer。消息删除使用`{id:目标消息ID,role:'remove',content:[]}`映射官方RemoveMessage。节点更新不开放P5历史检查点修改。

## 连接与凭据

支持用户自己的HTTP GET／POST工具、官方DeepSeek及MCP streamable HTTP连接；用户配置不能引入stdio命令。HTTP POST保守视为写入。HTTP／MCP目的地继续DNS检查、IP固定、重定向拒绝和大小限制；私网只在显式Local fixture环境开放，metadata地址始终拒绝。

连接与函数目录持久化在私有schema，启用RLS并撤销anon／authenticated直接访问，通过已认证API传入服务端owner。凭据使用[Supabase Vault](https://supabase.com/docs/guides/database/vault)加密保存，只有worker私有函数可解析活跃连接引用。浏览器仅见hasCredential与安全配置；轮换通过新连接版本，停用阻止后续调用。连接测试对外部写入需明确确认，测试成功不代替运行权限。

## 兼容与证据

P3旧executor checkpoint不提供无损迁移保证；版本不兼容明确拒绝且保留定义、等待和历史。Local通过不能替代Hosted、全provider兼容、长期Store或Worker自动接管验收。

验收报告须分别记录SDK原生、Docker组件、真实API／Worker、数据库、真实provider及浏览器证据。任何最终候选变化都标记受影响证据继承和复验范围，不把已保存配置当真实支持。

## 备选、代价与重审条件

本次Local交付采用已有Docker环境和固定OCI镜像，减少远程服务凭据、费用与部署引入；宿主直接执行源码不符合隔离边界。Hosted隔离服务作为后续部署选型，不据此宣称已支持。通用执行语义继续复用官方LangGraph策略及序列化，产品仅负责权限、预算、持久化事务与薄适配。

代价是Local必须启动Docker与独立watchdog，进程缓存不跨Worker共享，容器隔离强度不等同于Hosted多租户安全承诺。进入Hosted验收、需要第三方依赖、扩大资源上限、增加语言或隔离威胁模型时，先重审本ADR及受影响验收，再更新能力清单；不只修改前端选项。
