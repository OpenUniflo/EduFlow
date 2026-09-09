# Teaching Pattern Library V1

Status: **V1 frozen, 2026-09-09** after independent Teaching, simulated novice Student, Technical, Local and exact Hosted Preview acceptance. Ready for Lesson 2 authoring under this contract; no further platform expansion is required for the validated patterns. Canonical specification for Micro authors and AI authoring; acceptance is recorded in `.acceptance/teaching-pattern-library-v1.md`.

These six patterns are EduFlow's engineering classification based on learning-science principles, not an academic claim that digital microlearning has exactly six required modes. **Teaching Pattern ≠ Runtime Type ≠ UI Component.** Patterns describe an instructional need; a strategy describes the learner's cognitive action; a runtime renders and evaluates bounded content. No pattern enum, Course-specific component, new ontology or grading authority is implied.

## Selection contract

Before authoring, inspect the active Knowledge definition, required prior concepts, real MaterialSegments and the current Micro. Record the following in the authoring brief (offline planning metadata, not a new persisted domain):

- Knowledge identity and bounded learning objective; prerequisite concepts to explain locally.
- Source locators for each central claim; distinguish source facts, worked adaptations and simplified computational models.
- Knowledge type → instructional need → selected pattern(s), with a reason for each.
- Cognitive strategy → existing runtime and its actual limits → meaningful feedback.
- What the learner should be able to judge in a lightly changed scenario; local 1440/390, independent review and publication checks.

Choose the smallest sufficient composition. A short hook or Summary can be concise teaching without interaction; a central relation, comparison, process or changing quantity should be visible in the representation that naturally expresses it. Do not lengthen prose or add decorative motion to satisfy a quota. Do not make every Micro use all patterns or every page interactive. One main objective can use complementary patterns; the reason must be a real learning need, not uniform styling.

| Knowledge type / learner question | Default pattern | Selection boundary |
| --- | --- | --- |
| Definition / basic concept: what is it? | Concept Framing | Name objects and connect a concrete example; do not start with an unexplained full architecture. |
| Similar concepts: why are these different? | Contrast & Distinguish | Hold a scenario constant and expose the differentiating rule. |
| Components / structure: how do parts relate? | Structure Mapping | Show real semantic relationships; adjacency must not invent causality. |
| Steps / causal process: how does it run? | Worked Demonstration | Show an interpreted trace before requiring reconstruction. |
| Variable / mechanism: what changes if…? | Guided Exploration | Specify one observable intervention and interpreted comparison; capture any required prediction with an existing input. |
| Context-dependent judgment: what should I choose? | Case Application | Give sufficient conditions and a bounded decision; change the scenario, not just wording. |

## The six patterns

| Pattern / 中文 | Instructional purpose and applicable Knowledge | Not appropriate for | Recommended strategies | Existing runtime recommendations | Anti-pattern | Agent example | Non-Agent example |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Concept Framing / 概念建模 | Establish objects, names, basic responsibilities and a concrete referent; definitions and first encounters. | Explaining a changing numerical mechanism by labels alone. | Retrieval, Compare, Feedback | Text + concise labels; existing read-only `flow-execution` when a relationship warrants a diagram. | Definition followed by dense prose; unexplained terminology cloud. | A02: Model decides, Tool is an interface, Environment contains external facts. | K021: center word is a row, context word is a column. |
| Contrast & Distinguish / 对比辨析 | Expose the rule separating confusable concepts. | Unrelated concepts with no useful comparison criterion. | Compare, Explain Why, Reconstruct, Feedback | `categorize`, `choice`, `multiple-choice`; concise paired examples. | Two columns that repeat definitions without a discriminating case. | S03: necessary report-read access versus unrelated delete/email access; permission complements sandboxing. | K012: decaying oscillation versus growing oscillation, judged by successive errors. |
| Structure Mapping / 结构映射 | Make ownership, dependency or information relationships inspectable. | Forcing permission judgment into a process graph. | Reconstruct, Retrieval, Explain Why, Feedback | `flow-execution` read-only annotated relationships; `structure-builder`/`mini-workflow` only within their supported bounded contracts. | Drawing synthetic domain edges; presenting an execution sequence as a containment tree. | A02: Harness maintains State and constructs Context for Model; environment remains external. | K021: corpus event → row/column → cell; no new graph needed. |
| Worked Demonstration / 示例演示 | Show a complete interpreted process before asking the learner to handle a variation. | Repeated demonstration without interpretation or subsequent judgment. | Captured prediction when needed, Compare, Explain Why, Feedback | Read-only `flow-execution`, `simulation`, `data-transform`; existing Step/Play/Pause/Reset timeline. | Animation without a causal trace; answer key shown before the problem. | R10: observation enters Context and changes the next decision. | K012: calculate gradient → displacement → new parameter → Loss; K021: event increments one cell. |
| Guided Exploration / 引导探索 | Test a bounded causal change with explicit guidance. | Unguided slider play or a mechanism unsupported by existing computation. | Observable intervention → interpreted observation; captured causal judgment when needed; Feedback | Editable `flow-execution`, `simulation`, `data-transform`; choose the actual supported model. | “Try anything”; changed variables confounded; a generic numeric target standing in for computation. | R10: remove only the return edge, execute to the information boundary, restore and execute the complete trace; explain the difference in teaching text. | K012: vary η with fixed curvature; K021: map new corpus events into cells. |
| Case Application / 情境应用 | Apply an already explained rule to a lightweight changed condition. | Introducing unseen prerequisites through a trick question; long-form competency assessment. | Explain Why, Compare, Retrieval, Feedback | `choice`, `categorize`, `multiple-choice`, bounded `trace`; branching only if an existing contract represents it honestly. | Definition recall disguised with a character name; open-ended essay grader. | S03: moving from report summary to saving a draft changes necessary permissions. | K012: greater curvature requires reassessing the step; K021: new sentence changes counts. |

Runtime recommendations are advisory, not `if pattern then component` dispatch. Current inventory is in `MICRO_LEARNING_AND_EVIDENCE.md` and implemented by `NativeInteraction`, `runtime/MechanismInteraction`, `runtime/SpatialInteraction`, `MicroBody`, and `shared/learning/microMechanisms`. KaTeX renders explicit math; React Flow, Motion and dnd-kit already own graph/motion/drag infrastructure. H5P is an existing adapter, not the default way to add richer teaching. `simulation` currently computes quadratic descent only; `data-transform` computes bounded word-window events, not arbitrary transformations. Legacy text remains supported. New formal Micro uses shared Tiptap/ProseMirror JSON, never arbitrary HTML or a new rich-content DSL; see `RICH_TEXT_CONTENT.md`. Other courses need not migrate immediately.

## Cognitive strategies and feedback

Prediction, Explain Why, Retrieval, Reconstruct, Compare and Feedback are reusable strategies, **not extra patterns**. Required prediction, explanation and retrieval must use an existing observable input, such as a bounded choice, classification, ordering or connection repair. A private prediction, silent/oral recall or uncaptured self-explanation is not a formal learner task or assessment. Explain Why can ask the learner to select a mechanism or contrast reasons; this is guided reasoning, not equivalent evidence of open self-explanation. Retrieval should reduce visible answer cues.

### Observable Learner Action Rule

When a Step asks the learner to judge, predict, explain, recall, retell, classify, reconstruct, apply, compare or decide, and that action serves a comprehension check, guided practice, feedback basis, correctness judgment, completion claim or learning evidence, the system must observe **that same action**:

Learner Action → Observable Input / State Change → System Can Respond.

An unrelated interaction does not capture a prediction or explanation. An executed demonstration records execution, not understanding. Teaching, Explanation, Worked Demonstration, Feedback and Summary may have no interaction. Teach the knowledge clearly, or provide an action the system can observe and respond to; not every page needs a task. Do not disguise “想一想”, “先预测”, “口述一下”, “自己解释”, “你能复述吗” or “合上页面回答” as required learning work without captured input.

Continue / Next means browsing or workflow advancement only. **Continue ≠ understanding ≠ a correct answer ≠ mastery.** Neither unobserved behavior nor Micro completion supports a factual claim that the learner now possesses a capability. Summaries state knowledge relationships; titles such as “你已经掌握” require adequate actual evidence, not a completion click. This is an authoring/review contract, not a new Publish gate.

Feedback must identify a relationship, step, condition or mechanism. Wrong selections should point to the misconception and how to inspect it; successful selections should state why the rule works, not merely praise the click. Use existing Step `successFeedback`/`retryFeedback` and mechanism `teaching.feedback` reason keys plus `teaching.explanation`. A read-only demonstration can use its event explanation and takeaway as feedback. The runtime cannot infer an unobserved learner explanation; do not claim it did. Avoid generic “wrong, retry” and avoid labeling passive reading as a correct conceptual judgment.

**No long text by default.** Prefer click/single choice → classify → order → drag/connect → parameter manipulation → prediction/causal judgment → genuinely short answer. This is an interaction-cost preference, not a mandated stage sequence or difficulty ranking. Long-form writing belongs to future Practice/Assignment/Evidence work. No default Micro essay, recording requirement or AI grader. No required oral/silent retrieval or recording; use existing bounded inputs when retrieval is part of the teaching task.

An Explain/Demo should have enough of: core question, concise conclusion, concrete example, visible relation/change/process, and takeaway to serve its need. The diagram must carry meaning at 390 px, with accessible alternatives to drag, readable wrapping, visible primary action and no Assistant obstruction. Do not require the learner to decipher graph geometry to obtain essential meaning: adjacent event captions must name the relation.

## Student-Facing Content Rule

This global EduFlow course-content contract covers Micro titles, body/Summary, success/retry feedback, mechanism explanations/reason feedback, interaction instructions/options, event explanations and captions. Review every student-visible field, not only `micro_steps.content`.

**Micro Body = Teaching; Material/Provenance = Source; Course Shell = Navigation; Learning State = Completion/Mastery.**

Student content may explain concepts, examples, comparisons, processes, observable tasks, feedback and knowledge summaries. Keep factual limits needed to understand the demonstration: “这里播放的是预设轨迹，不调用真实服务”, “这是示意数据，并非实时天气查询”, and example-specific restrictions. Removing attribution must never turn an example into a universal claim.

Remove source locators and audit metadata from student prose: “来源：”, textbook/PDF pages, original-book chapters, MaterialSegment identities, provenance and authoring/audit records. Retain source and mapping data in Material, MaterialSegment, MaterialKnowledgeCoverage, provenance records and authoring/audit documents. A future student reference entry belongs to a separate “参考资料 / 查看教材” system surface.

Replace production notes such as “教学改编”, “跨节教学改编”, “本例根据教材改写” or “为便于教学” with the learning scenario: “设想两个候选模型处理同一航班任务”. State knowledge directly instead of appealing to textbook authority: “教材也要求凭证范围与有效期受限” becomes “凭证应限制作用范围和有效期”. Preserve definition scope when needed: “这里的 Harness 指……”. A particular booking example becomes “在这个订票示例中，流程依次为……”, never “所有订票流程都必须……”.

Do not embed Course routes or Next Action in content: “下一项 / 下一知识点 / 下一节 / 接下来学习 / 后续课程 / 回到课程 / 继续下一步”, or assumptions about preceding course items. Shell controls own navigation. A mechanism's “模型根据 Observation 决定下一步 Action” and instructions for the current interaction remain teaching.

Keep completion/mastery semantics in product contracts and learning-state code. Do not teach “学习活动完成不是掌握证明” as Knowledge content. The internal rule Micro completion ≠ mastery remains unchanged; summaries explain knowledge without unsupported learner capability claims.

Semantic review must distinguish **Removed — Provenance**, **Rewritten — Authoring Metadata**, **Removed — Route Coupling**, **Removed — Product State**, and **Retained — Necessary Caveat**. Keywords only locate candidates: “来源” can legitimately describe message origin, and a course may study a textbook itself. A narrow reviewed-Course regression test is not a global semantic validator or Publish gate. Preserve interaction answers, behavior, factual boundaries and source lineage.

## Authoring and addition gates

Authors and AI must follow Proposal → visual Preview/Diff → deterministic validation → explicit confirmation → Apply/Publish. Pattern selection grants no publish, navigation, mastery or mutation authority. Micro teaches and summarizes; the system shell owns optional Material/Practice/Next/Course/Return. One Knowledge-anchored Micro experience remains; historical scope fields are compatibility data. Completion contributes learned, not Micro-alone mastered; completed review writes nothing.

A proposed seventh pattern requires at least two materially different Knowledge examples with an unmet instructional need, evidence that no existing pattern or strategy composition describes it, clear inclusion/exclusion rules, a source-grounded rationale, and independent teaching/student review. Prefer clarifying an existing pattern. A pattern addition does not authorize a runtime addition.

New runtime/dependency consideration separately requires two actual Reference gaps, inability to use existing runtime reasonably, avoidance of a Course-specific hack, long-term reuse, higher self-implementation cost than a maintained compatible component, and acceptable license/bundle/mobile/maintenance cost. Record the blocker, smallest alternative and cost before implementation. Defaults: framework 0, dependency 0, schema DDL 0, runtime type 0.

## Learning-science basis and engineering limits

Sources verified on 2026-09-09. The following are rationales for design decisions, not efficacy results for EduFlow or a universal six-pattern prescription.

| Verified source | Principle used in EduFlow / limit |
| --- | --- |
| Krathwohl (2002), [A Revision of Bloom's Taxonomy: An Overview](https://www.tandfonline.com/doi/abs/10.1207/s15430421tip4104_2), *Theory Into Practice* 41(4), 212–218. | Separate knowledge content from cognitive process when stating objectives; the taxonomy is not a mandatory page sequence. |
| Merrill (2002), [First principles of instruction](https://doi.org/10.1007/BF02505024), *ETR&D* 50, 43–59. | Connect a task to prior understanding, demonstration and application; do not replace teaching with a test. |
| Fiorella & Mayer (2021), [Principles for Reducing Extraneous Processing in Multimedia Learning](https://doi.org/10.1017/9781108894333.019), Cambridge Handbook, chapter 14. | Coherence, signaling and proximity motivate meaningful diagrams and adjacent explanations; extra graphics are not automatically better. |
| Sweller & Cooper (1985), [The Use of Worked Examples as a Substitute for Problem Solving in Learning Algebra](https://doi.org/10.1207/s1532690xci0201_3), *Cognition and Instruction* 2, 59–89; [author bibliography](https://www.unsw.edu.au/staff/john-sweller). | Reduce novice search burden through worked examples before variation; algebra research is not direct evidence for every Micro. |
| Chi & Wylie (2014), [The ICAP Framework](https://doi.org/10.1080/00461520.2014.965823), *Educational Psychologist* 49(4), 219–243. | Judge the thinking the interaction invites; clicking or dragging alone does not establish constructive/interactive cognition. |
| Alfieri, Brooks, Aldrich & Tenenbaum (2011), [Does Discovery-Based Instruction Enhance Learning?](https://openresearch.surrey.ac.uk/esploro/outputs/journalArticle/Does-Discovery-Based-Instruction-Enhance-Learning/99515521902346), *Journal of Educational Psychology* 103(1). | Guided exploration uses worked examples, scaffolding and feedback; do not assume unguided discovery is sufficient. |
| Roediger & Karpicke (2006), [Test-Enhanced Learning](https://doi.org/10.1111/j.1467-9280.2006.01693.x), *Psychological Science* 17, 249–255. | Invite retrieval after explanation; a successful current click does not establish durable retention. |
| Chi, Bassok, Lewis, Reimann & Glaser (1989), [Self-Explanations](https://doi.org/10.1207/s15516709cog1302_1), *Cognitive Science* 13, 145–182. | Connect steps to reasons; short causal choices are a product adaptation, not equivalent evidence of self-generated explanations. |
| Hattie & Timperley (2007), [The Power of Feedback](https://journals.sagepub.com/doi/10.3102/003465430298487), *Review of Educational Research*. | Feedback addresses the task/process and next corrective move; praise alone does not explain the mechanism. |

Independent Teaching Review and simulated novice browser acceptance establish bounded design/usability evidence. They are not a human efficacy study, delayed-retention test or competence validation. V1 may freeze only when all five formal references, grounding, data integrity, responsive checks and required deployment acceptance pass.
