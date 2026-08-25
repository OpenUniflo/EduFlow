# Course authoring and publishing

Course design has one persisted authority: `course_authoring_drafts`. Browser
storage may hold transient UI state only; it is never course content authority.

```
Published Course runtime + persisted authoring delta
  -> teacher-only Preview runtime
  -> shared validation
  -> one database publish transaction
  -> canonical Course rows + learner-visible published Course
```

The draft payload keeps the established `CourseAuthoringDraftState` delta and a
server-saved preview snapshot. It has an integer revision. Saves use
compare-and-swap and return a conflict instead of silently replacing a newer
draft. Undo and redo are intentionally session-local.

Publishing materializes draft Knowledge candidates before replacing the
course-owned curriculum, Material, Assignment, outcome, mapping, and explicitly
edited course-scoped `MicroLearningPath -> MicroUnit -> MicroStep` rows. It
updates `courses.lifecycle` to `published` and clears the applied draft in the
same database transaction. A Micro projection is replaced only after a teacher
has explicitly edited it; an ordinary course draft cannot delete existing Micro
content. Learner `recent_lesson_id` and stale workflow-run references are made
safe inside that transaction before Course-owned rows change, while learner
Knowledge state and evidence remain independent.

The manual Teaching entrypoint creates a `draft` course with one initial chapter
and one initial lesson; target outcome is optional Course metadata even if the
current form prompts authors to provide it. A Draft may temporarily have no
CurriculumCoverage and remains loadable for continued editing, while dangling
owned references are still invalid. Full minimum-route validation is required
before the Course becomes learner-visible. Design Mode provides manual
Article Material creation/linking plus Path, Unit, native Step, Assignment, and
AssignmentCoverage editing. The Micro preview runs the same interaction
contract without publishing it. AI course creation remains a separate
proposal/demo workflow rather than a prerequisite for authoring.
