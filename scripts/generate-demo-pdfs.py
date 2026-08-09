#!/usr/bin/env python3
"""Generate original, repository-owned PDF fixtures for the EduFlow demo.

These files are build-time/demo source materials. The application never
generates or rewrites them at runtime.
"""

from pathlib import Path
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
PAGE_SIZE = (960, 540)
FONT = "EduFlowCJK"
FONT_CANDIDATES = [
    Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
    Path("/Library/Fonts/Arial Unicode.ttf"),
    Path("/System/Library/Fonts/Hiragino Sans GB.ttc"),
    Path("/System/Library/Fonts/STHeiti Medium.ttc"),
    Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
    Path("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"),
]
FONT_PATH = next((path for path in FONT_CANDIDATES if path.exists()), None)
if not FONT_PATH:
    raise RuntimeError("No supported CJK font found. Install Noto Sans CJK before regenerating fixtures.")
pdfmetrics.registerFont(TTFont(FONT, str(FONT_PATH), subfontIndex=0))


def wrap_text(text, font_name, font_size, max_width):
    lines, current = [], ""
    for character in text:
        candidate = current + character
        if current and pdfmetrics.stringWidth(candidate, font_name, font_size) > max_width:
            lines.append(current)
            current = character
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def draw_wrapped(pdf, text, x, y, width, font_size=16, leading=24, color=(0.24, 0.3, 0.4), max_lines=4):
    pdf.setFillColorRGB(*color)
    pdf.setFont(FONT, font_size)
    for index, line in enumerate(wrap_text(text, FONT, font_size, width)[:max_lines]):
        pdf.drawString(x, y - index * leading, line)
    return y - min(max_lines, len(wrap_text(text, FONT, font_size, width))) * leading


def make_pdf(path, course, lesson, pages, accent):
    path.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(path), pagesize=PAGE_SIZE, pageCompression=1)
    width, height = PAGE_SIZE
    for index, page in enumerate(pages, start=1):
        title = page["title"]
        section = page.get("section", lesson)
        summary = page.get("summary", f"本页围绕 {title} 建立可执行、可验证的工程理解。")
        bullets = page.get("bullets", [])
        code = page.get("code")

        pdf.setFillColorRGB(0.965, 0.975, 0.99)
        pdf.rect(0, 0, width, height, fill=1, stroke=0)
        pdf.setFillColorRGB(*accent)
        pdf.rect(0, height - 12, width, 12, fill=1, stroke=0)
        pdf.setFillColorRGB(0.91, 0.94, 0.98)
        pdf.circle(width - 75, height - 85, 115, fill=1, stroke=0)

        pdf.setFillColorRGB(*accent)
        pdf.setFont(FONT, 12)
        pdf.drawString(64, height - 55, f"{course}  /  {section}")
        pdf.setFillColorRGB(0.52, 0.58, 0.68)
        pdf.drawRightString(width - 64, height - 55, f"{index:02d} / {len(pages):02d}")

        pdf.setFillColorRGB(0.12, 0.17, 0.25)
        pdf.setFont(FONT, 30 if len(title) < 22 else 25)
        title_lines = wrap_text(title, FONT, 30 if len(title) < 22 else 25, 760)[:2]
        for line_index, line in enumerate(title_lines):
            pdf.drawString(64, height - 112 - line_index * 38, line)

        content_y = height - 190 if len(title_lines) == 1 else height - 220
        content_y = draw_wrapped(pdf, summary, 64, content_y, 820, 15, 23, max_lines=3) - 8

        if code:
            box_y = 72
            box_h = min(184, 30 + len(code.splitlines()) * 18)
            pdf.setFillColorRGB(0.13, 0.18, 0.26)
            pdf.roundRect(64, box_y, 832, box_h, 12, fill=1, stroke=0)
            pdf.setFillColorRGB(0.9, 0.94, 0.98)
            pdf.setFont("Courier", 11)
            for line_index, line in enumerate(code.splitlines()[:8]):
                pdf.drawString(84, box_y + box_h - 27 - line_index * 17, line[:112])
        else:
            for bullet_index, bullet in enumerate(bullets[:5]):
                bullet_y = content_y - bullet_index * 45
                pdf.setFillColorRGB(*accent)
                pdf.circle(76, bullet_y + 4, 4, fill=1, stroke=0)
                draw_wrapped(pdf, bullet, 92, bullet_y + 10, 770, 14, 20, max_lines=2)

        pdf.setStrokeColorRGB(0.82, 0.86, 0.92)
        pdf.line(64, 42, width - 64, 42)
        pdf.setFillColorRGB(0.5, 0.56, 0.65)
        pdf.setFont(FONT, 9)
        pdf.drawString(64, 24, "EduFlow Demo Original Material - generated from repository-owned teaching content")
        pdf.showPage()
    pdf.save()


def p(title, section, summary, bullets=None, code=None):
    return {"title": title, "section": section, "summary": summary, "bullets": bullets or [], "code": code}


AGENTIC = [
    p("推理、规划与反思范式", "课程导入", "智能体需要在推理、行动、观察与反思之间建立可控制的求解结构。", ["Reasoning 形成判断", "Acting 改变环境", "Observation 更新状态", "Reflection 改进下一轮"]),
    p("一个看似简单的任务", "课程导入", "比较高校生成式 AI 政策时，同一模型和工具可以采用完全不同的执行结构。", ["直接回答", "边搜索边判断", "先规划再执行", "失败后修改计划"]),
    p("回答正确不等于任务完成", "任务评价", "Agent 任务同时评价最终结果、信息来源、行动过程和约束满足情况。", ["结果是否满足目标", "来源是否可验证", "过程是否越权", "预算和停止条件是否满足"]),
    p("五个核心概念", "概念地图", "推理、规划、行动、观察和反思共同构成 Agent 的动态决策系统。", ["推理: 形成判断", "规划: 组织步骤", "行动: 调用外部能力", "观察: 读取反馈", "反思: 评价过程"]),
    p("决策范式的两条轴", "概念地图", "是否预先规划、是否依据环境反馈调整，是选择执行范式的两条关键轴。", ["ReAct: 强反馈", "Plan-and-Execute: 强规划", "Replanning: 规划加反馈", "Direct: 最小结构"]),
    p("Direct Response", "Direct", "当输入完整且输出可以一次生成时，Direct 是成本最低的正确结构。", ["单次生成", "无外部行动", "无显式循环", "适合摘要、分类和提取"]),
    p("Reactive 范式", "Reactive", "Reactive 系统根据当前状态立即行动，响应快但可能缺少长期一致性。", ["关注当前状态", "局部反馈快", "长期目标容易丢失", "需要边界和停止条件"]),
    p("Direct 与 Reactive 的局限", "Reactive", "信息不完整或任务较长时，Direct 和局部 Reactive 都可能积累错误。", ["无法主动补充事实", "缺少全局进度", "重复调用工具", "预算可能失控"]),
    p("为什么只有推理或只有行动都不够", "ReAct", "封闭推理缺少外部事实，盲目行动缺少目标关联，二者必须形成闭环。", ["推理维护方向", "行动获取新信息", "观察修正假设", "循环必须可停止"]),
    p("ReAct 的基本结构", "ReAct", "每轮依据最新 Observation 决定下一步 Action，并持续检查完成条件。", code="while not done:\n    action = reason(state, observation)\n    observation = execute(action)\n    state = update(state, observation)"),
    p("ReAct 执行示例", "ReAct", "搜索结果不可信时，Agent 根据 Observation 调整来源范围并继续完成任务。", ["识别信息缺口", "选择搜索工具", "验证来源", "更新下一步行动"]),
    p("ReAct 的优势", "ReAct", "ReAct 让工具结果真实改变后续行为，并逐步缩小未知范围。", ["适合开放式任务", "轨迹可以观察", "及时处理反馈", "关键未知逐轮收敛"]),
    p("ReAct 的典型失败", "ReAct", "没有进度和预算治理时，ReAct 可能循环、重复工具调用或偏离目标。", ["重复搜索", "过早停止", "观察未进入状态", "缺少最大步数"]),
    p("不要把 ReAct 等同于完整思维链", "ReAct", "工程审计需要决策证据、行动摘要和状态变化，而不是无限暴露内部生成文本。", ["记录当前子目标", "记录行动理由摘要", "保留工具参数", "保存 Observation 和状态变化"]),
    p("为什么需要先规划", "Planning", "具有依赖、中间产物和完成标准的复杂任务需要显式计划。", ["识别子目标", "声明依赖", "定义产物", "设置验收条件"]),
    p("Plan-and-Execute 结构", "Planning", "Planner 生成可执行计划，Executor 执行当前步骤并更新状态。", code="plan = planner(goal)\nfor step in plan:\n    result = executor(step, state)\n    state = update(state, result)"),
    p("一个合格的计划应包含什么", "Planning", "每一步都应明确输入、输出、依赖与完成条件。", ["输入可获得", "输出可保存", "依赖顺序有效", "完成可以检查"]),
    p("Plan-and-Execute 的优势和风险", "Planning", "计划保持全局结构，但错误假设会被执行器机械地放大。", ["优势: 进度可追踪", "优势: 支持人工审核", "风险: 初始计划失效", "风险: 规划成本过高"]),
    p("计划为什么会失效", "Replanning", "工具失败、环境变化、预算压力和新约束都会让剩余计划失效。", ["工具超时", "证据推翻假设", "用户追加目标", "权限或安全约束变化"]),
    p("Replanning 不是重新从头生成", "Replanning", "正确的 Replanning 保留已完成产物，只修改受新信息影响的剩余步骤。", ["冻结已完成步骤", "标记失效假设", "替换受影响步骤", "记录修改理由"]),
    p("Replanning 触发器", "Replanning", "触发器必须显式记录并映射到确定的恢复策略。", ["执行失败", "Observation 冲突", "目标变化", "预算越界", "安全策略阻断"]),
    p("什么是反思", "Reflection", "反思把结果和环境反馈转化为下一次行动的可执行改进。", ["评价当前结果", "识别失败原因", "形成改进动作", "决定继续、重试或停止"]),
    p("四种容易混淆的结构", "Reflection", "Self-Critique、Self-Refine、Reflexion 和 Evaluator-Optimizer 的反馈来源与记忆范围不同。", ["Self-Critique: 评价", "Self-Refine: 评价后修改", "Reflexion: 保留经验", "Evaluator-Optimizer: 角色分离"]),
    p("Evaluator-Optimizer", "Reflection", "Evaluator 根据 Rubric 输出通过或修订建议，Optimizer 只处理可验证缺陷。", code="evaluation = evaluator(output, rubric)\nif not evaluation.passed:\n    output = optimizer(output, evaluation.feedback)"),
    p("为什么评价器可能失败", "Reflection", "评价器可能共享生成器盲点，或因标准模糊给出无法执行的反馈。", ["Rubric 不明确", "共享知识盲点", "缺少外部验证", "偏好掩盖硬约束"]),
    p("反思什么时候值得使用", "Reflection", "高价值、可评价且允许迭代的任务更适合反思。", ["存在明确质量标准", "错误代价较高", "反馈能转成改进", "有最大迭代预算"]),
    p("单一路径推理的局限", "Search", "早期判断错误会污染后续步骤，需要在重要决策点保留多个候选。", ["比较多个方案", "允许回溯", "外部验证候选", "避免局部最优"]),
    p("Tree of Thoughts", "Search", "ToT 生成、评价和剪枝多个中间状态，并在必要时回溯。", code="frontier = expand(state)\nscored = evaluate(frontier)\nfrontier = keep_top_k(scored)"),
    p("搜索式推理的成本", "Search", "候选数量随深度快速增长，因此必须限制宽度、深度与模型预算。", ["Beam Search", "Top-K 保留", "规则剪枝", "低成本模型初筛"]),
    p("六种范式比较", "范式选择", "范式选择应从任务特征、反馈强度和主要失败模式出发。", ["Direct", "Reactive", "ReAct", "Plan-and-Execute", "Replanning", "Evaluator-Optimizer"]),
    p("选择范式的决策表", "范式选择", "先采用最简单可行结构，再只增加能够解决真实失败模式的机制。", ["输入完整则 Direct", "需要工具则 ReAct", "步骤稳定则 Planning", "计划易失效则 Replanning", "可评价则 Evaluator"]),
    p("一个现实系统通常是混合的", "范式选择", "混合架构不是堆叠复杂性，而是让每一层解决一个明确问题。", code="Goal\n  -> Plan-and-Execute\n  -> ReAct tool loop\n  -> Replanning on failure\n  -> Evaluator quality gate\n  -> Human review for high risk")
]


PYTHON_L02 = [
    p("Python 函数与模块工程", "Overview", "把脚本重构为边界清晰、可测试、可复用的 Python 模块。", ["控制流收束到函数", "函数声明输入输出", "模块公开稳定接口", "测试覆盖边界条件"]),
    p("控制流的可测试边界", "Functions", "复杂分支应拆成能够独立输入和断言输出的小函数。", ["减少隐藏状态", "提前处理异常分支", "保持主路径清晰", "用参数表达变化"]),
    p("函数输入输出契约", "Functions", "函数契约同时包含有效输入、返回结果和失败语义。", code="def normalize_score(value: float) -> float:\n    if not 0 <= value <= 100:\n        raise ValueError('score out of range')\n    return value / 100"),
    p("作用域、闭包与引用", "Scope", "理解局部变量、闭包捕获和可变对象引用，避免隐藏共享状态。", ["局部优先", "谨慎捕获可变对象", "显式传递依赖", "避免模块级可变状态"]),
    p("模块公开接口", "Modules", "使用小而稳定的公开 API 隔离内部实现变化。", ["__all__ 声明公开符号", "内部函数以下划线命名", "调用方只依赖公开接口", "文档描述契约"]),
    p("项目结构与依赖方向", "Engineering", "业务逻辑不应反向依赖 CLI、HTTP 或数据库等外层适配器。", ["domain 放核心规则", "adapters 放外部交互", "tests 对准公开边界", "配置从入口注入"]),
    p("重构为可测试模块", "Practice", "将读取、转换、输出拆分，使用依赖注入替换真实外部系统。", code="def run(load, save):\n    records = load()\n    result = transform(records)\n    save(result)"),
    p("异常契约作为模块边界", "Bridge", "异常类型是模块 API 的一部分，调用方应只处理公开的失败类别。", ["捕获最窄异常", "保留原始原因", "转换为领域错误", "不要静默吞掉失败"])
]


PYTHON_L04 = [
    p("异常、类型与自动化测试", "Overview", "Exception、Type Hint、pytest 和 Unit Test 共同建立快速反馈的质量防线。", ["异常表达运行时失败", "类型提示表达静态契约", "pytest 组织可执行规范", "单元测试隔离行为"]),
    p("失败是接口的一部分", "Exception", "可靠接口不仅说明成功返回值，也明确错误类型、上下文和恢复策略。", ["可恢复与不可恢复", "面向调用方的错误", "记录诊断上下文", "避免返回模糊 None"]),
    p("异常层级与边界", "Exception", "在最了解语义的边界转换异常，并通过 cause 保留底层诊断信息。", code="try:\n    payload = client.fetch()\nexcept TimeoutError as exc:\n    raise ServiceUnavailable('upstream timeout') from exc"),
    p("Exception 设计实战", "Exception", "为配置错误、外部服务失败和数据校验失败设计不同的领域异常。", ["名称表达业务语义", "附带可诊断字段", "不要捕获 BaseException", "finally 负责资源清理"]),
    p("Type Hint 与静态反馈", "Typing", "Type Hint 把函数契约前移到编辑和 CI 阶段，但不替代运行时校验。", code="def load_user(user_id: str) -> User | None:\n    ...\n\ndef require_user(user_id: str) -> User:\n    user = load_user(user_id)\n    if user is None:\n        raise UserNotFound(user_id)\n    return user"),
    p("pytest 测试结构", "pytest", "Arrange、Act、Assert 让失败原因清晰，fixture 复用稳定的测试前置。", ["测试名称描述行为", "每个测试只验证一个原因", "fixture 控制依赖", "断言输出和副作用"]),
    p("Unit Test 与依赖隔离", "Unit Test", "单元测试通过替身隔离网络、时间和存储，聚焦当前行为。", code="def test_timeout_is_translated(fake_client):\n    fake_client.fetch.side_effect = TimeoutError()\n    with pytest.raises(ServiceUnavailable):\n        service.load()"),
    p("参数化与失败路径", "Testing", "参数化测试系统覆盖边界输入，并让失败路径与成功路径同等重要。", ["空值", "边界值", "非法类型", "上游超时", "重复请求"]),
    p("从异常契约到测试契约", "Integration", "每个公开异常都应有对应测试，确保重构不会改变调用方观察到的失败语义。", ["异常类型稳定", "消息包含关键上下文", "cause 被保留", "日志不泄露敏感信息"]),
    p("质量防线综合练习", "Practice", "为一个外部 API adapter 增加类型、异常转换、pytest 和覆盖失败路径的单元测试。", ["定义公开接口", "建立领域异常", "注入 fake client", "覆盖成功、超时和非法数据"])
]


PYTHON_L07 = [
    p("异步 Python 服务实战", "Overview", "构建具有并发边界、超时、取消、重试和可观测性的异步服务。", ["明确任务生命周期", "限制并发", "传播取消", "观察完整请求"]),
    p("Event Loop 与协程", "Async", "Event Loop 调度可暂停的协程，让等待 I/O 的时间服务其他任务。", ["coroutine", "task", "await", "cooperative scheduling"]),
    p("async/await 执行模型", "Async", "await 只在可等待边界让出控制权，CPU 密集任务仍需独立执行策略。", code="async def load_all(ids):\n    async with asyncio.TaskGroup() as group:\n        tasks = [group.create_task(load(i)) for i in ids]\n    return [task.result() for task in tasks]"),
    p("并发任务与背压", "Concurrency", "无限创建 Task 会耗尽连接和内存，需要 semaphore 或队列限制并发。", ["设置并发上限", "限制队列长度", "拒绝或降级过载", "记录等待时间"]),
    p("超时边界", "Reliability", "为外部操作和整体请求分别设置超时，避免单个依赖拖垮服务。", code="async with asyncio.timeout(2.0):\n    result = await client.fetch()"),
    p("取消与资源清理", "Reliability", "取消是正常控制流，资源必须在 finally 或异步上下文中可靠释放。", ["传播 CancelledError", "关闭连接", "回滚临时状态", "不要吞掉取消"]),
    p("异常传播", "Exception", "并发任务的失败需要聚合、分类并映射到稳定的服务错误。", ["保留根因", "区分局部与整体失败", "记录 task identity", "返回可恢复信息"]),
    p("有界重试与 Backoff", "Recovery", "只对瞬时故障重试，并使用指数退避、抖动和最大尝试次数。", code="for attempt in range(max_attempts):\n    try:\n        return await operation()\n    except TransientError:\n        await asyncio.sleep(backoff(attempt))"),
    p("日志、指标与 Trace", "Production", "统一 correlation ID 连接一次请求的日志、指标和跨步骤 Trace。", ["结构化日志", "延迟和错误率指标", "span 记录外部调用", "避免敏感数据"]),
    p("可靠异步服务练习", "Practice", "实现有界并发 HTTP 聚合服务，并验证超时、取消、重试与观测行为。", ["TaskGroup 管理任务", "Semaphore 限制并发", "超时触发取消", "测试失败与恢复"])
]


if __name__ == "__main__":
    make_pdf(ROOT / "public/materials/agentic-ai/lesson-04.pdf", "Agentic AI", "第四课", AGENTIC, (0.36, 0.48, 0.88))
    make_pdf(ROOT / "public/materials/python-engineering/lesson-02.pdf", "Python Engineering", "第二课", PYTHON_L02, (0.24, 0.62, 0.48))
    make_pdf(ROOT / "public/materials/python-engineering/lesson-04.pdf", "Python Engineering", "第四课", PYTHON_L04, (0.24, 0.62, 0.48))
    make_pdf(ROOT / "public/materials/python-engineering/lesson-07.pdf", "Python Engineering", "第七课", PYTHON_L07, (0.24, 0.62, 0.48))
    print("Generated demo PDFs in public/materials")
