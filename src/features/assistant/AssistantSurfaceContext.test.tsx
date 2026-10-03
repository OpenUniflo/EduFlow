import {describe,expect,it} from 'vitest';
import {renderToString} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {GlobalAssistantSurface} from './AssistantSurfaceContext';
import {EduFlowAssistant} from './components/EduFlowAssistant';
const session={userId:'viewer',name:'Viewer',email:'viewer@eduflow.test',role:'student' as const,capabilities:[],createdAt:'2026-10-03'};
describe('global authenticated Assistant surface',()=>{
 for(const path of ['/','/explore','/courses','/courses/project','/courses/project/assignments/task','/learn/micro/knowledge','/workflows','/workflows/canvas','/messages','/teaching'])it(`renders one surface at ${path} without page-local instances`,()=>{
  const html=renderToString(<MemoryRouter initialEntries={[path]}><GlobalAssistantSurface session={session} onUpdateCapabilities={()=>undefined}><main/><EduFlowAssistant contextLabel="page context"/><EduFlowAssistant contextLabel="nested adapter"/></GlobalAssistantSurface></MemoryRouter>);
  expect(html.match(/aria-label="EduFlow Assistant"/g)).toHaveLength(1);
  expect(html.match(/aria-label="打开 EduFlow Assistant"/g)).toHaveLength(1);
 });
});
