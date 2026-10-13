import { describe, expect, it } from 'vitest';
import { coursePresentationContext, fallbackAssistantContext, learningPresentationContext } from './presentationContext';
import { parseAssistantContext } from './assistantContract';

const course = { courseId:'course', design:true, routeVersionId:'version-2', graph:{knowledgeId:'old-node',chapterId:'chapter',assignmentId:'task'}, path:{knowledgeId:'bridge',edgeId:'route-edge'}, capability:{edgeId:'project-edge',actionId:'action'} };
describe('foreground Assistant presentation identity',()=>{
 it('drops Today knowledge and course on Evidence and History',()=>{
  const today={courseId:'old-course',knowledgeId:'old-node'};
  expect(learningPresentationContext('today',today)).toMatchObject(today);
  for(const view of ['evidence','history'] as const)expect(learningPresentationContext(view,today)).toEqual({workspace:'learning',experienceMode:'learn',presentation:view});
 });
 it('Evidence source changes replace identity and do not leak into Today',()=>{
  const today={knowledgeId:'today-node',courseId:'today-course'};
  expect(learningPresentationContext('evidence',today,{sourceId:'a',runId:'run-a'})).toMatchObject({evidenceSourceId:'a',diagnosisRunId:'run-a'});
  const next=learningPresentationContext('evidence',today,{sourceId:'b'});
  expect(next.evidenceSourceId).toBe('b');expect(next.diagnosisRunId).toBeUndefined();expect(next.knowledgeId).toBeUndefined();
  expect(learningPresentationContext('today',today,{sourceId:'b',runId:'run-a'})).toEqual({workspace:'learning',experienceMode:'learn',presentation:'today',...today});
 });
 it('Project ignores the old curriculum anchor and authoring mode',()=>{
  expect(coursePresentationContext({...course,presentation:'capability'})).toEqual({workspace:'courses',experienceMode:'learn',courseId:'course',presentation:'project-capability',routeVersionId:'version-2',edgeId:'project-edge',actionId:'action'});
 });
 it('Route retains a Bridge identity without curriculum membership',()=>{
  expect(coursePresentationContext({...course,presentation:'path'})).toEqual({workspace:'courses',experienceMode:'learn',courseId:'course',presentation:'personal-route',routeVersionId:'version-2',knowledgeId:'bridge',edgeId:'route-edge'});
 });
 it('explicit Skill Tree design retains authoring context without a route version',()=>{
  expect(coursePresentationContext({...course,presentation:'graph'})).toEqual({workspace:'courses',experienceMode:'design',courseId:'course',presentation:'skill-tree',...course.graph});
 });
 it('clearing Project selection cannot reveal the old graph node',()=>{
  const result=coursePresentationContext({...course,presentation:'capability',capability:{}});
  expect(result.knowledgeId).toBeUndefined();expect(result.edgeId).toBeUndefined();expect(result.assignmentId).toBeUndefined();
 });
 it('creation is not a course identity; real course fallback remains scoped',()=>{
  expect(fallbackAssistantContext('/courses/create').courseId).toBeUndefined();
  expect(fallbackAssistantContext('/courses/course/assignments/task').courseId).toBe('course');
  expect(fallbackAssistantContext('/messages').workspace).toBe('messages');
 });
 it('round-trips distinct evidence, diagnosis, action-run and route identities',()=>{
  const context={workspace:'learning',experienceMode:'learn',presentation:'evidence-workspace',evidenceSourceId:'source',diagnosisRunId:'diagnosis',actionRunId:'execution',routeVersionId:'version',edgeId:'fact'};
  expect(parseAssistantContext(context)).toEqual(context);
  expect(()=>parseAssistantContext({...context,diagnosisRunId:'x,or(id.eq.y)'})).toThrow(/diagnosisRunId/);
 });
});
