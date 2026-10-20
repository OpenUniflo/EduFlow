import json,copy,subprocess
from pathlib import Path
from eduflow_workflow.contracts import semantic_hash
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'artifacts/workflow/checks/conformance/hash';OUT.mkdir(parents=True,exist_ok=True)
base=json.loads((ROOT/'tests/workflow-integration/fixtures/semantic-hash-definition.json').read_text())
vectors=[{'id':'base','definition':base}]
d=copy.deepcopy(base);d['name']='改名';d['workflowId']='another';d['revision']=99;d['nodes'][1]['label']='另一个名称';vectors.append({'id':'labels-and-identity','definition':d})
d=copy.deepcopy(base);d['nodes'].reverse();d['transitions'].reverse();vectors.append({'id':'set-order','definition':d})
for identity,value in [('negative-zero',-0.0),('small-float',1e-7),('float',333.3333333333333),('safe-int',9007199254740991),('array-order-a',[1,2]),('array-order-b',[2,1]),('unicode-object',{'🌎':'中文','é':'é','\ue000':'a','𐀀':'b'})]:
 d=copy.deepcopy(base);d['state']['initial']['answer']=value;vectors.append({'id':identity,'definition':d})
d=copy.deepcopy(base);d['nodes'][1]['id']='𐀀';d['nodes'][2]['id']='\ue000';d['transitions']=[{'id':'𐀀','from':'start','to':'𐀀','outlet':'next'},{'id':'\ue000','from':'𐀀','to':'\ue000','outlet':'next'}];vectors.append({'id':'utf16-order','definition':d})
for identity,value in [('unsafe-int',9007199254740992),('invalid-string','\ud800'),('invalid-object-key',{'\ud800':'value'})]:
 d=copy.deepcopy(base);d['state']['initial']['answer']=value;vectors.append({'id':identity,'definition':d})
file=OUT/'vectors.json';file.write_text(json.dumps(vectors,ensure_ascii=True,indent=2))
js=subprocess.run(['node','--import','tsx','tests/workflow-integration/contracts/hash_differential.mjs',str(file)],cwd=ROOT,capture_output=True,text=True);assert js.returncode==0,js.stderr
js_rows=json.loads(js.stdout);assert len(js_rows)==len(vectors);results=[]
for vector,row in zip(vectors,js_rows):
 try:value=semantic_hash(vector['definition']);accepted=True
 except Exception:value=None;accepted=False
 results.append({'id':vector['id'],'pythonAccepted':accepted,'typescriptAccepted':row['accepted'],'pythonHash':value,'typescriptHash':row.get('hash'),'match':accepted==row['accepted'] and value==row.get('hash')})
assert results[0]['pythonHash']==results[1]['pythonHash']==results[2]['pythonHash'],'Non-semantic changes altered hash'
assert results[7]['pythonHash']!=results[8]['pythonHash'],'Semantic array order was lost'
(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps({'vectors':len(results),'mismatches':[r for r in results if not r['match']]},ensure_ascii=False))

assert all(row["match"] for row in results), "Cross-language conformance mismatch"
