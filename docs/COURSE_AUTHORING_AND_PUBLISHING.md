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
course-owned curriculum, Material, Assignment, outcome, and mapping rows. It
updates `courses.lifecycle` to `published` and clears the applied draft in the
same database transaction. Editing an already published course therefore never
changes what learners read until Publish succeeds.

The manual Teaching entrypoint creates a `draft` course with a target outcome,
one initial chapter, and one initial lesson. AI course creation remains a
separate proposal/demo workflow rather than a prerequisite for authoring.
