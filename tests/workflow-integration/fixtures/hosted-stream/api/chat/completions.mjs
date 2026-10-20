// Temporary deterministic OpenAI SSE fixture; never counted as a real model.
import {timingSafeEqual} from 'node:crypto';
export default async function handler(request,response){
 const actual=Buffer.from(request.headers.authorization??''),expected=Buffer.from('Bearer '+process.env.P6_STREAM_TOKEN);
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected)){response.status(401).json({error:{message:'Unauthorized fixture'}});return;}
 response.setHeader('Content-Type','text/event-stream');response.setHeader('Cache-Control','no-cache');
 let closed=false;response.on('close',()=>{closed=true;});
 for(let index=0;index<300&&!closed;index++){
  response.write('data: '+JSON.stringify({id:'p6-controlled-interruption',object:'chat.completion.chunk',created:Math.floor(Date.now()/1000),model:'p6-controlled-interruption',choices:[{index:0,delta:{content:index===0?'controlled-start.'.repeat(8):'x'},finish_reason:null}]})+'\n\n');
  await new Promise(resolve=>setTimeout(resolve,300));
 }
 if(!closed){response.write('data: '+JSON.stringify({id:'p6-controlled-interruption',object:'chat.completion.chunk',choices:[{index:0,delta:{},finish_reason:'stop'}]})+'\n\n');response.end('data: [DONE]\n\n');}
}
