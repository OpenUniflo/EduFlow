// Controlled protocol fixture, deliberately emits its synthetic credential across chunks.
// This is never counted as a real model integration.
import {timingSafeEqual} from 'node:crypto';
export default async function handler(request,response){
 const actual=Buffer.from(request.headers.authorization??''),expected=Buffer.from('Bearer '+process.env.P6_COUNTER_TOKEN);
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected)){response.status(401).json({error:{message:'Unauthorized fixture'}});return;}
 const secret=process.env.P6_COUNTER_TOKEN,at=Math.floor(secret.length/2);
 response.setHeader('Content-Type','text/event-stream');response.setHeader('Cache-Control','no-cache');
 for(const content of ['Synthetic protected value: ',secret.slice(0,at),secret.slice(at),' end']){
  response.write('data: '+JSON.stringify({id:'p6-controlled-stream',object:'chat.completion.chunk',created:Math.floor(Date.now()/1000),model:'p6-controlled-stream',choices:[{index:0,delta:{content},finish_reason:null}]})+'\n\n');
  await new Promise(r=>setTimeout(r,100));
 }
 response.write('data: '+JSON.stringify({id:'p6-controlled-stream',object:'chat.completion.chunk',choices:[{index:0,delta:{},finish_reason:'stop'}]})+'\n\n');response.end('data: [DONE]\n\n');
}
