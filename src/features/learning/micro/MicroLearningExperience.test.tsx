import { beforeEach, expect, it, vi } from 'vitest';
import type { MicroLearningRepository } from './microLearning';
const host=vi.hoisted(()=>({slots:[] as any[],index:0,effects:[] as (()=>void)[],actionRunId:'run'}));
const api=vi.hoisted(()=>vi.fn());
vi.mock('react',async()=>({...await vi.importActual<typeof import('react')>('react'),
 useState(initial:any){const i=host.index++;if(!(i in host.slots))host.slots[i]=typeof initial==='function'?initial():initial;return[host.slots[i],(value:any)=>{host.slots[i]=typeof value==='function'?value(host.slots[i]):value;}];},
 useRef(initial:any){return host.slots[host.index++]??={current:initial};},
 useMemo(fn:()=>unknown){return fn();},useCallback(fn:unknown){return fn;},
 useEffect(fn:()=>void,deps:any[]){const i=host.index++,old=host.slots[i];if(!old||deps.some((value,index)=>value!==old.deps[index])){host.effects.push(fn);host.slots[i]={deps};}},
}));
vi.mock('react-router-dom',()=>({useNavigate:()=>vi.fn(),useLocation:()=>({state:null}),useParams:()=>({knowledgeId:'target'}),useSearchParams:()=>[new URLSearchParams(`courseId=course&pathId=path${host.actionRunId?'&actionRunId='+host.actionRunId:''}`)]}));
vi.mock('@/shared/api/apiClient',()=>({apiRequest:api}));
vi.mock('@/app/services/applicationServices',()=>({applicationServices:{courseRepository:{getCourse:()=>undefined}},refreshLearnerState:vi.fn()}));
vi.mock('@/app/components/GlobalNav',()=>({GlobalNav:()=>null}));
vi.mock('@/features/assistant/components/EduFlowAssistant',()=>({EduFlowAssistant:()=>null}));
import { MicroLearningExperience } from './MicroLearningExperience';
const progress=vi.fn(),start=vi.fn(),repository={subscribe:()=>()=>{},getPath:()=>({id:'path',knowledgeId:'target',units:[{id:'unit',steps:[{id:'step',kind:'explanation',body:{type:'text',text:'information'}}]}]}),getPathProgress:progress,getUnitProgress:()=>undefined,start} as unknown as MicroLearningRepository;
function render(){host.index=0;const tree=MicroLearningExperience({session:null,onLogout:vi.fn(),repository});host.effects.splice(0).forEach(effect=>effect());return tree;}
beforeEach(()=>{host.slots=[];host.effects=[];host.actionRunId='run';progress.mockReset().mockReturnValue(undefined);start.mockReset().mockResolvedValue(undefined);api.mockReset().mockImplementation((path:string)=>path.includes('runId=')?Promise.resolve({run:{status:'in_progress',micro_path_id:'path',execution_snapshot:{targetId:'target'}},microStepIds:[]}):Promise.resolve({}));});
it('starts an Action through its owned Run without issuing the UKS-gated standalone start',async()=>{
 render();await Promise.resolve();await Promise.resolve();await Promise.resolve();render();
 expect(api).toHaveBeenCalledWith('/api/edge-actions',expect.objectContaining({body:JSON.stringify({action:'transition',runId:'run',operation:'start'})}));
 expect(start).not.toHaveBeenCalled();
});
it('ordinary Micro learning still starts its path',()=>{host.actionRunId='';render();expect(start).toHaveBeenCalledWith('path','course');});

it("completed ordinary path progress does not complete a fresh Action Run",async()=>{progress.mockReturnValue({status:"completed"});render();await Promise.resolve();await Promise.resolve();await Promise.resolve();const tree=render();expect(JSON.stringify(tree)).toContain("本次行动进度 0/1");expect(JSON.stringify(tree)).not.toContain("PATH COMPLETED");expect(start).not.toHaveBeenCalled();});
