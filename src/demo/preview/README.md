# Feature Preview

Small, obviously synthetic datasets used by the new UI before a backend exists.
The first example is the `people` source used later by 首页「关注的人」.

Rules:

- Implement the same contract as the real adapter (`PeopleRepository` in
  `src/features/profile/people/PeopleRepository.ts`).
- Inject from `src/app/services/previewServices.ts`; Feature code never imports
  this directory.
- Reads are fixed samples; every write throws `PreviewReadOnlyError`. No
  `localStorage`, `indexedDB`, network or Supabase use.
- Identities are visibly sample (`示例 · 阿青`, `@preview-aqing`), and every
  rendered preview region carries `<PreviewBadge />`.
