# Teaching Pattern Library V1

Status: candidate for independent teaching, simulated novice, technical and deployment acceptance. Canonical specification for Micro authors and AI authoring; acceptance is recorded in `.acceptance/teaching-pattern-library-v1.md`.

These six patterns are EduFlow's engineering classification based on learning-science principles, not an academic claim that digital microlearning has exactly six required modes. **Teaching Pattern ≠ Runtime Type ≠ UI Component.** Patterns describe an instructional need; a strategy describes the learner's cognitive action; a runtime renders and evaluates bounded content. No pattern enum, Course-specific component, new ontology or grading authority is implied.

## Selection contract

Before authoring, inspect the active Knowledge definition, required prior concepts, real MaterialSegments and the current Micro. Record the following in the authoring brief (offline planning metadata, not a new persisted domain):

- Knowledge identity and bounded learning objective; prerequisite concepts to explain locally.
- Source locators for each central claim; distinguish source facts, worked adaptations and simplified computational models.
- Knowledge type → instructional need → selected pattern(s), with a reason for each.
- Cognitive strategy → existing runtime and its actual limits → meaningful feedback.
- What the learner should be able to judge in a lightly changed scenario; local 1440/390, independent review and publication checks.

Choose the smallest sufficient composition. A short hook or Summary can be plain text; a central relation, comparison, process or changing quantity should be visible in the representation that naturally expresses it. Do not lengthen prose or add decorative motion to satisfy a quota. Do not make every Micro use all patterns or every page interactive. One main objective can use complementary patterns; the reason must be a real learning need, not uniform styling.

| Knowledge type / learner question | Default pattern | Selection boundary |
| --- | --- | --- |
| Definition / basic concept: what is it? | Concept Framing | Name objects and connect a concrete example; do not start with an unexplained full architecture. |
| Similar concepts: why are these different? | Contrast & Distinguish | Hold a scenario constant and expose the differentiating rule. |
| Components / structure: how do parts relate? | Structure Mapping | Show real semantic relationships; adjacency must not invent causality. |
| Steps / causal process: how does it run? | Worked Demonstration | Show an interpreted trace before requiring reconstruction. |
| Variable / mechanism: what changes if…? | Guided Exploration | Specify prediction, one intervention, observation and causal comparison. |
| Context-dependent judgment: what should I choose? | Case Application | Give sufficient conditions and a bounded decision; change the scenario, not just wording. |

## The six patterns

| Pattern / 中文 | Instructional purpose and applicable Knowledge | Not appropriate for | Recommended strategies | Existing runtime recommendations | Anti-pattern | Agent example | Non-Agent example |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Concept Framing / 概念建模 | Establish objects, names, basic responsibilities and a concrete referent; definitions and first encounters. | Explaining a changing numerical mechanism by labels alone. | Retrieval, Compare, Feedback | Text + concise labels; existing read-only `flow-execution` when a relationship warrants a diagram. | Definition followed by dense prose; unexplained terminology cloud. | A02: Model decides, Tool is an interface, Environment contains external facts. | K021: center word is a row, context word is a column. |
| Contrast & Distinguish / 对比辨析 | Expose the rule separating confusable concepts. | Unrelated concepts with no useful comparison criterion. | Compare, Explain Why, Reconstruct, Feedback | `categorize`, `choice`, `multiple-choice`; concise paired examples. | Two columns that repeat definitions without a discriminating case. | S03: necessary report-read access versus unrelated delete/email access; permission complements sandboxing. | K012: decaying oscillation versus growing oscillation, judged by successive errors. |
| Structure Mapping / 结构映射 | Make ownership, dependency or information relationships inspectable. | Forcing permission judgment into a process graph. | Reconstruct, Retrieval, Explain Why, Feedback | `flow-execution` read-only annotated relationships; `structure-builder`/`mini-workflow` only within their supported bounded contracts. | Drawing synthetic domain edges; presenting an execution sequence as a containment tree. | A02: Harness maintains State and constructs Context for Model; environment remains external. | K021: corpus event → row/column → cell; no new graph needed. |
| Worked Demonstration / 示例演示 | Show a complete interpreted process before asking the learner to handle a variation. | Repeated demonstration without interpretation or subsequent judgment. | Prediction at a meaningful pause, Compare, Explain Why, Feedback | Read-only `flow-execution`, `simulation`, `data-transform`; existing Step/Play/Pause/Reset timeline. | Animation without a causal trace; answer key shown before the problem. | R10: observation enters Context and changes the next decision. | K012: calculate gradient → displacement → new parameter → Loss; K021: event increments one cell. |
| Guided Exploration / 引导探索 | Test a bounded causal change with explicit guidance. | Unguided slider play or a mechanism unsupported by existing computation. | Prediction → intervention → observation → Compare → Explain Why; Feedback | Editable `flow-execution`, `simulation`, `data-transform`; choose the actual supported model. | “Try anything”; changed variables confounded; a generic numeric target standing in for computation. | R10: predict the effect of missing return, remove only that edge, observe the missing-information boundary, restore and compare. | K012: vary η with fixed curvature; K021: map new corpus events into cells. |
| Case Application / 情境应用 | Apply an already explained rule to a lightweight changed condition. | Introducing unseen prerequisites through a trick question; long-form competency assessment. | Explain Why, Compare, Retrieval, Feedback | `choice`, `categorize`, `multiple-choice`, bounded `trace`; branching only if an existing contract represents it honestly. | Definition recall disguised with a character name; open-ended essay grader. | S03: moving from report summary to saving a draft changes necessary permissions. | K012: greater curvature requires reassessing the step; K021: new sentence changes counts. |

Runtime recommendations are advisory, not `if pattern then component` dispatch. Current inventory is in `MICRO_LEARNING_AND_EVIDENCE.md` and implemented by `NativeInteraction`, `runtime/MechanismInteraction`, `runtime/SpatialInteraction`, `MicroBody`, and `shared/learning/microMechanisms`. KaTeX renders explicit math; React Flow, Motion and dnd-kit already own graph/motion/drag infrastructure. H5P is an existing adapter, not the default way to add richer teaching. `simulation` currently computes quadratic descent only; `data-transform` computes bounded word-window events, not arbitrary transformations. Text remains text, not arbitrary HTML or a new rich-content DSL.

## Cognitive strategies and feedback

Prediction, Explain Why, Retrieval, Reconstruct, Compare and Feedback are reusable strategies, **not extra patterns**. A prediction can be a short private judgment before Step, or a bounded choice; it need not create a new durable response. Make the predicted observable explicit and compare it afterwards. Explain Why preferably asks the learner to select a mechanism or contrast reasons. This is guided reasoning, not proof of the same benefit as open self-explanation. Reconstruct can mean ordering, classification or connection repair. Retrieval should reduce visible answer cues; optional silent/brief oral recall does not require typing or establish mastery.

Feedback must identify a relationship, step, condition or mechanism. Wrong selections should point to the misconception and how to inspect it; successful selections should state why the rule works, not merely praise the click. Use existing Step `successFeedback`/`retryFeedback` and mechanism `teaching.feedback` reason keys plus `teaching.explanation`. A read-only demonstration can use its event explanation and takeaway as feedback. The runtime cannot infer an unobserved learner explanation; do not claim it did. Avoid generic “wrong, retry” and avoid labeling passive reading as a correct conceptual judgment.

**No long text by default.** Prefer click/single choice → classify → order → drag/connect → parameter manipulation → prediction/causal judgment → genuinely short answer. This is an interaction-cost preference, not a mandated stage sequence or difficulty ranking. Long-form writing belongs to future Practice/Assignment/Evidence work. No default Micro essay, recording requirement or AI grader. Optional oral/silent retrieval is skippable and never a completion gate.

An Explain/Demo should have enough of: core question, concise conclusion, concrete example, visible relation/change/process, and takeaway to serve its need. The diagram must carry meaning at 390 px, with accessible alternatives to drag, readable wrapping, visible primary action and no Assistant obstruction. Do not require the learner to decipher graph geometry to obtain essential meaning: adjacent event captions must name the relation.

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
