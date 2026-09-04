-- Generated from data/gold-courses/ai-agents-in-depth-book-audit.tsv. Do not edit the mapping rows by hand.
begin;

create temporary table agent_book_audit (
  knowledge_id text primary key,
  classification text not null check (classification in ('DIRECT','CROSS_SECTION','EDUFLOW_ADDED','UNSUPPORTED')),
  printed_ranges text not null,
  pdf_ranges text not null,
  deep_link_pdf_page integer,
  evidence text not null
) on commit drop;

insert into agent_book_audit(knowledge_id, classification, printed_ranges, pdf_ranges, deep_link_pdf_page, evidence) values
  ('A02', 'DIRECT', '7-14', '15-22', 15, '1.1 Agent formula and architecture'),
  ('AGC01', 'DIRECT', '8-9', '16-17', 16, '1.1.1 observation and action spaces'),
  ('R10', 'DIRECT', '14-17', '22-25', 22, '1.1.5 ReAct loop'),
  ('AGC02', 'DIRECT', '18-26', '26-34', 26, '1.2 Harness engineering'),
  ('AGC03', 'DIRECT', '21', '29', 29, '1.2.4 model selection'),
  ('H02', 'DIRECT', '22-24', '30-32', 30, '1.2.5 workflow and autonomy'),
  ('WF05', 'CROSS_SECTION', '22-25;164-165', '30-33;172-173', 30, 'orchestration plus evaluation and guardrails'),
  ('S01', 'DIRECT', '25-26', '33-34', 33, '1.2.6 guardrails and safety'),
  ('S02', 'DIRECT', '19;110-113', '27;118-121', 27, 'Harness sandbox and execution-tool isolation'),
  ('S03', 'DIRECT', '107;144', '115;152', 115, 'tool and Coding Agent least-privilege boundaries'),
  ('CTX01', 'DIRECT', '31-39', '39-47', 39, '2.2 API message context'),
  ('RT01', 'DIRECT', '32-39', '40-47', 40, '2.2.3-2.2.4 core Agent loop'),
  ('CTX02', 'DIRECT', '45-46', '53-54', 53, '2.3.1 chat template'),
  ('CTX03', 'DIRECT', '47', '55', 55, '2.3.2 KV Cache'),
  ('CTX04', 'DIRECT', '48', '56', 56, '2.3.3 Prompt Cache'),
  ('CTX05', 'DIRECT', '48-49', '56-57', 56, '2.3.4 cache as architecture constraint'),
  ('CTX06', 'DIRECT', '50-52', '58-60', 58, '2.4 system prompt design'),
  ('CTX07', 'DIRECT', '52', '60', 60, '2.4.5 few-shot examples'),
  ('CTX08', 'DIRECT', '53-54', '61-62', 61, '2.4.7 prompt injection'),
  ('MA04', 'DIRECT', '55-58', '63-66', 63, '2.5 Agent Skills'),
  ('C03', 'DIRECT', '59-63', '67-71', 67, '2.6 Agent state bar'),
  ('RT06', 'CROSS_SECTION', '59-63;175-186', '67-71;183-194', 67, 'state trajectory plus evaluation observability'),
  ('CTX09', 'DIRECT', '64-68', '72-76', 72, '2.7 context compression'),
  ('CTX10', 'DIRECT', '69', '77', 77, '2.7.7 sub-Agent context isolation'),
  ('K04', 'DIRECT', '59-63', '67-71', 67, '2.6 persistent and transient working state'),
  ('K05', 'DIRECT', '71-80', '79-88', 79, '3.1 user memory system'),
  ('MEM01', 'DIRECT', '73-75', '81-83', 81, '3.1.2-3.1.4 memory representations'),
  ('MEM02', 'DIRECT', '75', '83', 83, '3.1.4 executable code representation'),
  ('MEM03', 'DIRECT', '79', '87', 87, '3.1.7 compression and consolidation'),
  ('MEM04', 'DIRECT', '79', '87', 87, '3.1.8 log redaction'),
  ('K12', 'DIRECT', '81', '89', 89, '3.2.1 chunking'),
  ('K13', 'DIRECT', '82-83', '90-91', 90, '3.2.2 dense embedding'),
  ('RAG01', 'DIRECT', '82-83', '90-91', 90, '3.2.2 dense retrieval'),
  ('RAG02', 'DIRECT', '84-85', '92-93', 92, '3.2.3 sparse retrieval'),
  ('RAG03', 'DIRECT', '86-87', '94-95', 94, '3.2.4 hybrid retrieval'),
  ('RAG04', 'DIRECT', '88-92', '96-100', 96, '3.3 structured knowledge indexing'),
  ('RAG05', 'DIRECT', '92-94', '100-102', 100, '3.3.3 knowledge update'),
  ('RAG06', 'DIRECT', '94-96', '102-104', 102, '3.3.4 Agentic RAG'),
  ('RAG07', 'DIRECT', '97', '105', 105, '3.3.5 context-aware retrieval'),
  ('RAG08', 'DIRECT', '100', '108', 108, '3.3.7 multimodal memory'),
  ('MA03', 'DIRECT', '102-103', '110-111', 110, '4.1-4.2 tools'),
  ('T11', 'DIRECT', '103-105', '111-113', 111, '4.2 tool interface design'),
  ('T12', 'DIRECT', '32-39', '40-47', 40, '2.2.3-2.2.4 function calling loop'),
  ('TOOL01', 'DIRECT', '103', '111', 111, '4.2.2 tool granularity'),
  ('TOOL02', 'DIRECT', '104', '112', 112, '4.2.3 tool generality'),
  ('TOOL03', 'DIRECT', '104', '112', 112, '4.2.4 tool descriptions'),
  ('T14', 'DIRECT', '104-105', '112-113', 112, '4.2.5 argument fidelity'),
  ('MA06', 'DIRECT', '105-106', '113-114', 113, '4.3 MCP ecosystem'),
  ('TOOL04', 'DIRECT', '115-125', '123-133', 123, '4.7 event-driven asynchronous Agent'),
  ('TOOL05', 'DIRECT', '117', '125', 125, '4.7.3-4.7.4 triggers and communication'),
  ('TOOL06', 'DIRECT', '118', '126', 126, '4.7.5 virtual identity'),
  ('TOOL07', 'DIRECT', '119-124', '127-132', 127, '4.7.6-4.7.7 interruptible execution'),
  ('TOOL08', 'DIRECT', '126-129', '134-137', 134, '4.8 progressive tool disclosure'),
  ('RT14', 'DIRECT', '138-140', '146-148', 146, '5.1.5-5.1.6 failure recovery'),
  ('CODE01', 'DIRECT', '141-143', '149-151', 149, '5.1.7-5.1.8 search and editing'),
  ('CODE02', 'DIRECT', '146', '154', 154, '5.2.1 code as reasoning'),
  ('CODE03', 'DIRECT', '147-148', '155-156', 155, '5.2.2 deterministic business rules'),
  ('CODE04', 'DIRECT', '152', '160', 160, '5.2.4 system adapter'),
  ('CODE05', 'DIRECT', '153-157', '161-165', 161, '5.2.5 generative UI'),
  ('CODE06', 'DIRECT', '158-160', '166-168', 166, '5.2.6 Agent bootstrap'),
  ('EVAL01', 'DIRECT', '164-165', '172-173', 172, '6.2 evaluation metric system'),
  ('EVAL02', 'DIRECT', '164', '172', 172, '6.2.1 Pass@k'),
  ('EVAL03', 'DIRECT', '164', '172', 172, '6.2.2 Pass^k'),
  ('E14', 'CROSS_SECTION', '165;175-179', '173;183-187', 173, 'process metrics plus trajectory failure attribution'),
  ('EVAL04', 'DIRECT', '165', '173', 173, '6.2.4 safety robustness and trajectory coverage'),
  ('EVAL05', 'DIRECT', '165', '173', 173, '6.2.5 human and adversarial review'),
  ('EVAL06', 'DIRECT', '166-168', '174-176', 174, '6.3 automated evaluation environments'),
  ('EVAL07', 'DIRECT', '169-172', '177-180', 177, '6.4 evaluation datasets'),
  ('EVAL08', 'DIRECT', '173-175', '181-183', 181, '6.5.1 LLM-as-a-Judge'),
  ('E05', 'DIRECT', '177-179', '185-187', 185, '6.5.3 regression tasks'),
  ('EVAL09', 'DIRECT', '180', '188', 188, '6.5.4 pairwise comparison and ranking'),
  ('EVAL11', 'CROSS_SECTION', '181-184;187-188', '189-192;195-196', 189, 'model selection plus improvement decisions'),
  ('EVAL10', 'DIRECT', '185', '193', 193, '6.7 statistical significance'),
  ('E06', 'DIRECT', '185-186', '193-194', 193, '6.8 observability'),
  ('EVAL12', 'DIRECT', '191-192', '199-200', 199, '6.11 simulation fidelity and domain randomization'),
  ('TRAIN01', 'DIRECT', '194-198', '202-206', 202, '7.1 pretraining SFT and RL'),
  ('TRAIN02', 'DIRECT', '195;208-210', '203;216-218', 203, 'SFT objective and data masking'),
  ('TRAIN03', 'DIRECT', '196-197;211', '204-205;219', 204, 'SFT versus RL selection'),
  ('TRAIN04', 'DIRECT', '196', '204', 204, 'LoRA parameter-efficient tuning'),
  ('TRAIN05', 'DIRECT', '210', '218', 218, '7.5 SFT trajectory synthesis'),
  ('TRAIN06', 'DIRECT', '212-214', '220-222', 220, '7.7 single-turn RL memory and generalization'),
  ('TRAIN07', 'DIRECT', '215', '223', 223, '7.8 rollout-to-update loop'),
  ('TRAIN08', 'DIRECT', '216-217', '224-225', 224, '7.9 RL and simulated environments'),
  ('TRAIN09', 'DIRECT', '217', '225', 225, '7.9.3 task distribution and evaluation isolation'),
  ('TRAIN10', 'DIRECT', '218-221', '226-229', 226, '7.10 multi-turn credit assignment'),
  ('EVO01', 'DIRECT', '232', '240', 240, '8.1 runtime trajectory signals'),
  ('EVO02', 'DIRECT', '235', '243', 243, '8.2.1 experience to knowledge'),
  ('EVO03', 'DIRECT', '236-237', '244-245', 244, '8.2.2 experience to instructions'),
  ('EVO04', 'DIRECT', '238-239', '246-247', 246, '8.2.3 experience to programs'),
  ('EVO05', 'DIRECT', '240', '248', 248, '8.2.4 experience to parameters'),
  ('EVO06', 'DIRECT', '240', '248', 248, '8.2.5 improving update methods'),
  ('EVO07', 'DIRECT', '241-244', '249-252', 249, '8.3 continual evolution loop'),
  ('S08', 'EDUFLOW_ADDED', '', '', null, 'generic service deployment is a route bridge not reliably taught by the book'),
  ('EVO08', 'DIRECT', '244', '252', 252, '8.3.5 sleep learning'),
  ('MM01', 'DIRECT', '247', '255', 255, '9.1.1 speech interaction timing'),
  ('MM02', 'DIRECT', '248-250', '256-258', 256, '9.1.2 cascading voice pipeline'),
  ('MM03', 'DIRECT', '251', '259', 259, '9.1.3 end-to-end omni model'),
  ('MM04', 'DIRECT', '252', '260', 260, '9.1.4 full-duplex interaction'),
  ('MM05', 'DIRECT', '252-254', '260-262', 260, '9.1.5 real-time and deep-thinking timing'),
  ('MM06', 'DIRECT', '254', '262', 262, '9.1.6 natural speech synthesis'),
  ('CU01', 'DIRECT', '256', '264', 264, '9.2.1 action spaces'),
  ('CU02', 'DIRECT', '257-258', '265-266', 265, '9.2.2 visual grounding'),
  ('CU03', 'DIRECT', '259', '267', 267, '9.2.3 multimodal GUI perception'),
  ('CU04', 'DIRECT', '260', '268', 268, '9.2.4 Computer Use world model'),
  ('CU05', 'DIRECT', '260', '268', 268, '9.2.5 mobile ecosystem constraints'),
  ('ROB01', 'DIRECT', '261-262', '269-270', 269, '9.3.1 hardware and algorithm division'),
  ('MAC01', 'DIRECT', '268-269', '276-277', 276, '10.1 collaboration classification'),
  ('MAC02', 'DIRECT', '269-270', '277-278', 277, '10.2 multi-Agent suitability'),
  ('MAC03', 'DIRECT', '271', '279', 279, '10.3 shared-context collaboration'),
  ('MAC04', 'DIRECT', '271-285', '279-293', 279, '10.4 non-shared-context collaboration'),
  ('MAC05', 'DIRECT', '272-273', '280-281', 280, '10.4.1 filesystem collaboration'),
  ('MAC06', 'DIRECT', '274-275;279', '282-283;287', 282, '10.4.2 and manager communication control'),
  ('MAC07', 'DIRECT', '288', '296', 296, '10.5.1 concurrency conflict'),
  ('MAC08', 'DIRECT', '289', '297', 297, '10.5.2 error cascade'),
  ('MAC09', 'DIRECT', '289', '297', 297, '10.5.3 premature termination and runaway loops'),
  ('MAC10', 'DIRECT', '289', '297', 297, '10.5.4 understanding debt'),
  ('MAC11', 'DIRECT', '290-294', '298-302', 298, '10.6 Agent society');

create temporary table agent_book_evidence_ranges (
  knowledge_id text not null,
  range_index integer not null,
  pdf_start integer not null,
  pdf_end integer not null,
  primary key (knowledge_id, range_index)
) on commit drop;

insert into agent_book_evidence_ranges(knowledge_id, range_index, pdf_start, pdf_end) values
  ('A02', 0, 15, 22),
  ('AGC01', 0, 16, 17),
  ('R10', 0, 22, 25),
  ('AGC02', 0, 26, 34),
  ('AGC03', 0, 29, 29),
  ('H02', 0, 30, 32),
  ('WF05', 0, 30, 33),
  ('WF05', 1, 172, 173),
  ('S01', 0, 33, 34),
  ('S02', 0, 27, 27),
  ('S02', 1, 118, 121),
  ('S03', 0, 115, 115),
  ('S03', 1, 152, 152),
  ('CTX01', 0, 39, 47),
  ('RT01', 0, 40, 47),
  ('CTX02', 0, 53, 54),
  ('CTX03', 0, 55, 55),
  ('CTX04', 0, 56, 56),
  ('CTX05', 0, 56, 57),
  ('CTX06', 0, 58, 60),
  ('CTX07', 0, 60, 60),
  ('CTX08', 0, 61, 62),
  ('MA04', 0, 63, 66),
  ('C03', 0, 67, 71),
  ('RT06', 0, 67, 71),
  ('RT06', 1, 183, 194),
  ('CTX09', 0, 72, 76),
  ('CTX10', 0, 77, 77),
  ('K04', 0, 67, 71),
  ('K05', 0, 79, 88),
  ('MEM01', 0, 81, 83),
  ('MEM02', 0, 83, 83),
  ('MEM03', 0, 87, 87),
  ('MEM04', 0, 87, 87),
  ('K12', 0, 89, 89),
  ('K13', 0, 90, 91),
  ('RAG01', 0, 90, 91),
  ('RAG02', 0, 92, 93),
  ('RAG03', 0, 94, 95),
  ('RAG04', 0, 96, 100),
  ('RAG05', 0, 100, 102),
  ('RAG06', 0, 102, 104),
  ('RAG07', 0, 105, 105),
  ('RAG08', 0, 108, 108),
  ('MA03', 0, 110, 111),
  ('T11', 0, 111, 113),
  ('T12', 0, 40, 47),
  ('TOOL01', 0, 111, 111),
  ('TOOL02', 0, 112, 112),
  ('TOOL03', 0, 112, 112),
  ('T14', 0, 112, 113),
  ('MA06', 0, 113, 114),
  ('TOOL04', 0, 123, 133),
  ('TOOL05', 0, 125, 125),
  ('TOOL06', 0, 126, 126),
  ('TOOL07', 0, 127, 132),
  ('TOOL08', 0, 134, 137),
  ('RT14', 0, 146, 148),
  ('CODE01', 0, 149, 151),
  ('CODE02', 0, 154, 154),
  ('CODE03', 0, 155, 156),
  ('CODE04', 0, 160, 160),
  ('CODE05', 0, 161, 165),
  ('CODE06', 0, 166, 168),
  ('EVAL01', 0, 172, 173),
  ('EVAL02', 0, 172, 172),
  ('EVAL03', 0, 172, 172),
  ('E14', 0, 173, 173),
  ('E14', 1, 183, 187),
  ('EVAL04', 0, 173, 173),
  ('EVAL05', 0, 173, 173),
  ('EVAL06', 0, 174, 176),
  ('EVAL07', 0, 177, 180),
  ('EVAL08', 0, 181, 183),
  ('E05', 0, 185, 187),
  ('EVAL09', 0, 188, 188),
  ('EVAL11', 0, 189, 192),
  ('EVAL11', 1, 195, 196),
  ('EVAL10', 0, 193, 193),
  ('E06', 0, 193, 194),
  ('EVAL12', 0, 199, 200),
  ('TRAIN01', 0, 202, 206),
  ('TRAIN02', 0, 203, 203),
  ('TRAIN02', 1, 216, 218),
  ('TRAIN03', 0, 204, 205),
  ('TRAIN03', 1, 219, 219),
  ('TRAIN04', 0, 204, 204),
  ('TRAIN05', 0, 218, 218),
  ('TRAIN06', 0, 220, 222),
  ('TRAIN07', 0, 223, 223),
  ('TRAIN08', 0, 224, 225),
  ('TRAIN09', 0, 225, 225),
  ('TRAIN10', 0, 226, 229),
  ('EVO01', 0, 240, 240),
  ('EVO02', 0, 243, 243),
  ('EVO03', 0, 244, 245),
  ('EVO04', 0, 246, 247),
  ('EVO05', 0, 248, 248),
  ('EVO06', 0, 248, 248),
  ('EVO07', 0, 249, 252),
  ('EVO08', 0, 252, 252),
  ('MM01', 0, 255, 255),
  ('MM02', 0, 256, 258),
  ('MM03', 0, 259, 259),
  ('MM04', 0, 260, 260),
  ('MM05', 0, 260, 262),
  ('MM06', 0, 262, 262),
  ('CU01', 0, 264, 264),
  ('CU02', 0, 265, 266),
  ('CU03', 0, 267, 267),
  ('CU04', 0, 268, 268),
  ('CU05', 0, 268, 268),
  ('ROB01', 0, 269, 270),
  ('MAC01', 0, 276, 277),
  ('MAC02', 0, 277, 278),
  ('MAC03', 0, 279, 279),
  ('MAC04', 0, 279, 293),
  ('MAC05', 0, 280, 281),
  ('MAC06', 0, 282, 283),
  ('MAC06', 1, 287, 287),
  ('MAC07', 0, 296, 296),
  ('MAC08', 0, 297, 297),
  ('MAC09', 0, 297, 297),
  ('MAC10', 0, 297, 297),
  ('MAC11', 0, 298, 302);

do $$
begin
  if (select count(*) from agent_book_audit) <> 117 then raise exception 'agent_book_audit_count_mismatch'; end if;
  if exists (select 1 from courses where id = 'ai-agents-in-depth') and (exists (
    select 1 from agent_book_audit a
    left join curriculum_coverages c on c.course_id = 'ai-agents-in-depth' and c.node_id = a.knowledge_id
    where c.node_id is null
  ) or exists (
    select 1 from curriculum_coverages c
    left join agent_book_audit a on a.knowledge_id = c.node_id
    where c.course_id = 'ai-agents-in-depth' and a.knowledge_id is null
  )) then raise exception 'agent_book_audit_identity_mismatch'; end if;
  if exists (select 1 from courses where id = 'ai-agents-in-depth') and not exists (select 1 from storage.objects where bucket_id = 'course-materials' and name = 'shared/ai-agents-in-depth/AI-Agents-in-Depth-zh-CN.pdf') then
    raise exception 'agent_book_storage_object_missing';
  end if;
end $$;

update materials set display_order = 1
where course_id = 'ai-agents-in-depth' and id = 'M03-memory-rag';

insert into materials(course_id,id,display_order,title,description,material_type,storage_path,page_count,duration)
select 'ai-agents-in-depth','ai-agents-in-depth-book',0,'深入理解 AI Agent（完整原书）','课程主要原始资料；Knowledge 深链使用真实 PDF page。','pdf','shared/ai-agents-in-depth/AI-Agents-in-Depth-zh-CN.pdf',307,'自定进度'
where exists (select 1 from courses where id = 'ai-agents-in-depth')
  and exists (select 1 from storage.objects where bucket_id = 'course-materials' and name = 'shared/ai-agents-in-depth/AI-Agents-in-Depth-zh-CN.pdf')
on conflict (course_id,id) do update set display_order=excluded.display_order,title=excluded.title,description=excluded.description,material_type=excluded.material_type,storage_path=excluded.storage_path,page_count=excluded.page_count,duration=excluded.duration;

insert into material_segments(course_id,material_id,id,display_order,page,title,section)
select 'ai-agents-in-depth','ai-agents-in-depth-book','page-' || page,(page - 1),page,'PDF 第 ' || page || ' 页','完整原书'
from generate_series(1,307) page
where exists (select 1 from materials where course_id = 'ai-agents-in-depth' and id = 'ai-agents-in-depth-book')
on conflict (course_id,material_id,id) do update set display_order=excluded.display_order,page=excluded.page,title=excluded.title,section=excluded.section;

-- M03 remains available as a legacy Course asset, but no longer competes in the
-- Knowledge learning path. The full book is the only mapped primary source.
delete from material_knowledge_coverages
where course_id = 'ai-agents-in-depth' and material_id in ('M03-memory-rag','ai-agents-in-depth-book');

insert into material_knowledge_coverages(course_id,id,material_id,segment_id,node_id,role)
select 'ai-agents-in-depth', 'book-audit-' || a.knowledge_id || '-' || r.pdf_start,
  'ai-agents-in-depth-book', 'page-' || r.pdf_start, a.knowledge_id, 'explain'
from agent_book_audit a
join agent_book_evidence_ranges r on r.knowledge_id = a.knowledge_id
join materials m on m.course_id = 'ai-agents-in-depth' and m.id = 'ai-agents-in-depth-book'
where a.classification in ('DIRECT','CROSS_SECTION')
order by a.knowledge_id, r.range_index;

commit;
