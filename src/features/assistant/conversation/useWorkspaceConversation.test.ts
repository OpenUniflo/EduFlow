import { beforeEach, expect, it, vi } from 'vitest';
const host=vi.hoisted(()=>({slots:[] as any[],index:0,effects:[] as (()=>void)[]}));
vi.mock('react',()=>({
 useState(initial:any){const i=host.index++;if(!(i in host.slots))host.slots[i]=typeof initial==='function'?initial():initial;return[host.slots[i],(value:any)=>{host.slots[i]=typeof value==='function'?value(host.slots[i]):value;}];},
 useRef(initial:any){const i=host.index++;return host.slots[i]??={current:initial};},
 useMemo(fn:any,deps:any[]){const i=host.index++,old=host.slots[i];if(!old||deps.some((d,j)=>d!==old.deps[j]))host.slots[i]={value:fn(),deps};return host.slots[i].value;},
 useCallback(fn:any,deps:any[]){const i=host.index++,old=host.slots[i];if(!old||deps.some((d,j)=>d!==old.deps[j]))host.slots[i]={fn,deps};return host.slots[i].fn;},
 useEffect(fn:any,deps:any[]){const i=host.index++,old=host.slots[i];if(!old||deps.some((d,j)=>d!==old.deps[j])){host.effects.push(()=>{old?.cleanup?.();host.slots[i].cleanup=fn();});host.slots[i]={deps};}},
}));
vi.mock('@/shared/api/apiClient',()=>({apiRequest:vi.fn()}));
vi.mock('../assistantClient',()=>({getAssistantSession:vi.fn(),streamAssistantMessage:vi.fn()}));
import {apiRequest} from '@/shared/api/apiClient';
import {getAssistantSession,streamAssistantMessage} from '../assistantClient';
import {useWorkspaceConversation} from './useWorkspaceConversation';
function render(actionRunId='old'){host.index=0;const result=useWorkspaceConversation('practice',{workspace:'courses',experienceMode:'learn',courseId:'course',assignmentId:'assignment',actionRunId});host.effects.splice(0).forEach(effect=>effect());return result;}
async function flush(){for(let i=0;i<6;i++)await Promise.resolve();}
beforeEach(()=>{host.slots=[];host.effects=[];vi.mocked(apiRequest).mockReset();vi.mocked(getAssistantSession).mockReset();vi.mocked(streamAssistantMessage).mockReset();vi.stubGlobal('localStorage',{getItem:()=>null,setItem:vi.fn()});vi.mocked(apiRequest).mockImplementation(async (_url,options)=>({sessionId:JSON.parse(options!.body as string).context.actionRunId}));vi.mocked(getAssistantSession).mockImplementation(async id=>({messages:[{id,sessionId:id,content:id,role:'assistant',context:{workspace:'courses'},createdAt:''}]} as any));});
it('a diagnosis finishing after re-run cannot record or reload the previous session into the new Run',async()=>{
 render();await flush();const previous=render();expect(previous.sessionId).toBe('old');
 render('new');await flush();expect(render('new').messages[0].content).toBe('new');
 const requests=vi.mocked(apiRequest).mock.calls.length;
 await previous.record('diagnosis','old-diagnosis');
 expect(apiRequest).toHaveBeenCalledTimes(requests);expect(render('new').references).toEqual([]);expect(render('new').messages[0].content).toBe('new');
 expect(await previous.send('old review')).toBe(false);expect(streamAssistantMessage).not.toHaveBeenCalled();
});
it('an already-recording old request cannot replace the new session when its response arrives',async()=>{
 render();await flush();const previous=render();let resolve!: (value:any)=>void;
 vi.mocked(apiRequest).mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
 const recording=previous.record('diagnosis','old-diagnosis');render('new');await flush();
 resolve({});await recording;expect(render('new').messages[0].content).toBe('new');expect(render('new').references).toEqual([]);
});
it('the current Run continues to persist and restore its own timeline reference',async()=>{
 render('new');await flush();await render('new').record('submission','new-attempt');
 expect(render('new').references[0]).toMatchObject({event:'submission',referenceId:'new-attempt'});expect(render('new').messages[0].sessionId).toBe('new');
});
