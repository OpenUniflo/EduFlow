import { useState } from 'react';
import type { JsonSchema, JsonValue } from '../../domain/v2/types';
import { interactionResponseIssue } from '../../domain/v2/authoring';
import { validateSchemaValue } from '../../domain/v2/validation';
import { SchemaForm } from './SchemaForm';

export type ResponseDraft={value:Record<string,JsonValue>;invalid?:string};
export function NodeResponseForm({title,schema,value,onChange,onInvalid,onSubmit,busy=false,preview=false,batchOnly=false,breakpoint=false}:{title:string;schema:JsonSchema;value:Record<string,JsonValue>;onChange:(value:Record<string,JsonValue>)=>void;onInvalid:(message:string)=>void;onSubmit:()=>Promise<boolean>|boolean;busy?:boolean;preview?:boolean;batchOnly?:boolean;breakpoint?:boolean}){
  const [touched,setTouched]=useState(false);
  const [sending,setSending]=useState(false);const [error,setError]=useState('');const [invalid,setInvalid]=useState('');
  async function submit(){
    setTouched(true);
    const issue=invalid||interactionResponseIssue(schema,value)||validateSchemaValue(schema,value).errors[0];
    if(issue){setError(issue);return;}
    setError('');setSending(true);
    try{if(!await onSubmit())setError('回应尚未确认，请查看执行状态或重试。重试会沿用同一份回应，不会重复创建执行。');}
    finally{setSending(false);}
  }
  return <form className="wf-node-response" aria-label={title} onChangeCapture={()=>setTouched(true)} onSubmit={event=>{event.preventDefault();void submit();}}>
    <strong>{title}</strong><p className="wf-field-note">{breakpoint?'当前执行停在调试断点；继续将沿用检查点。':preview?'前端演示：填写后继续此节点。':'此节点正在等待你补充信息。提交后会从这里继续。'}</p>
    <fieldset disabled={busy||sending}><SchemaForm showValidation={touched} schema={schema} value={value} label="需要补充的信息" prefix="node-response" onChange={next=>{onChange(next as Record<string,JsonValue>);setError('');}} onInvalid={message=>{setInvalid(message);onInvalid(message);}}/>
    <button type="submit" className="primary" disabled={batchOnly}>{busy||sending?'正在提交…':breakpoint?'继续调试断点':'提交回应并继续'}</button></fieldset>
    {batchOnly?<p>调试断点按整图继续。请填写其他等待项，再点击「提交全部已填写回应并继续」。</p>:null}
    {error?<p role="alert">{error}</p>:null}
  </form>;
}
