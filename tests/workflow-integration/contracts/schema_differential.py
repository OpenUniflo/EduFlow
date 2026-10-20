import json,subprocess
from pathlib import Path
from eduflow_workflow.contracts import schema_check,validate_value
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'artifacts/workflow/checks/conformance/schema';OUT.mkdir(parents=True,exist_ok=True)
vectors=[
 {'id':'nullable','schema':{'type':['string','null']},'value':None},
 {'id':'no-coerce','schema':{'type':'number'},'value':'2'},
 {'id':'default-not-applied','schema':{'type':'object','properties':{'a':{'type':'number','default':2}},'required':['a']},'value':{}},
 {'id':'unsupported-pattern','schema':{'type':'string','pattern':'a'},'value':'a'},
 {'id':'unsupported-union','schema':{'anyOf':[{'type':'string'},{'type':'number'}]},'value':1},
 {'id':'nullable-enum','schema':{'type':['string','null'],'enum':['a',None]},'value':None},
 {'id':'integer-vs-bool','schema':{'type':'integer'},'value':True},
 {'id':'json-const-bool','schema':{'const':True},'value':1},
 {'id':'additional-false','schema':{'type':'object','properties':{},'additionalProperties':False},'value':{'unexpected':None}},
 {'id':'local-ref','schema':{'$defs':{'num':{'type':'number'}},'$ref':'#/$defs/num'},'value':17},
 {'id':'remote-ref','schema':{'$ref':'https://example.test/schema'},'value':17},
 {'id':'recursive-ref','schema':{'$defs':{'x':{'$ref':'#/$defs/x'}},'$ref':'#/$defs/x'},'value':{}},
 {'id':'min-length-emoji','schema':{'type':'string','minLength':2},'value':'🌎'},
 {'id':'strict-excl-min','schema':{'type':'number','exclusiveMinimum':2},'value':2},
 {'id':'draft2020-annotation','schema':{'$schema':'https://json-schema.org/draft/2020-12/schema','type':'number'},'value':3},
 {'id':'draft07-annotation-mcp','schema':{'$schema':'http://json-schema.org/draft-07/schema#','type':'number'},'value':3},
 {'id':'ref-with-annotation','schema':{'$defs':{'x':{'type':'string'}},'$ref':'#/$defs/x','title':'ok','description':'annotation','default':'b'},'value':'a'}]
file=OUT/'vectors.json';file.write_text(json.dumps(vectors,ensure_ascii=False,indent=2))
js=subprocess.run(['node','--import','tsx','tests/workflow-integration/contracts/schema_differential.mjs',str(file)],cwd=ROOT,capture_output=True,text=True);assert js.returncode==0,js.stderr
js_results=json.loads(js.stdout);assert len(js_results)==len(vectors);results=[]
for item,js_result in zip(vectors,js_results):
 valid=True;value_valid=True
 try:schema_check(item['schema'])
 except Exception:valid=False
 try:
  schema_check(item['schema']);validate_value(item['schema'],item['value'])
 except Exception:value_valid=False
 results.append({'id':item['id'],'python':{'schemaValid':valid,'valueValid':value_valid},'typescript':js_result,'match':valid==js_result['schemaValid'] and value_valid==js_result['valueValid']})
(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps({'vectors':len(results),'mismatches':[r for r in results if not r['match']]},ensure_ascii=False))

assert all(row["match"] for row in results), "Cross-language conformance mismatch"
