# Micro Learning and Evidence

EduFlow's learner loop is persisted and data driven:

`Knowledge -> MicroLearningPath -> MicroUnit -> MicroStep -> Evidence -> UserKnowledgeState`

`MicroLearningPath` is a reusable or course-specific learning experience for one Knowledge. It is not a personal learning plan. Required Units determine path completion; progress stores the current Unit and Step so reopening resumes from the database.

Native `choice`, `ordering`, `trace`, and `mini-workflow` interactions carry their deterministic evaluation data in the Step contract. `h5p` remains an explicit external-content boundary and renders unsupported until an adapter is installed.

Knowledge state transitions are monotonic: starting learning reaches `learning`, completing a required Learn Path reaches `learned`, starting a related Assignment reaches `practicing`, and the mastery policy may reach `mastered`.

The MVP mastery policy is intentionally conservative. Every required Learn Path must be completed and every explicitly required Assignment must be `accepted`. If no Assignment is explicitly required, path completion remains `learned`. `submitted` is never acceptance or mastery.

Evidence is owned by EduFlow and idempotent by `(user, knowledge, event type, source entity)`. It records `micro_path_completed`, `assignment_accepted`, and `workflow_passed` with source identity, outcome, context, and timestamp. This is intentionally shaped for future xAPI export without making xAPI the canonical internal model.
