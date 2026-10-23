// Minimal local OpenAI-compatible fixture for acceptance and unit tests.
// Run: node tests/workflow-integration/fake-openai/server.mjs
// It prints one JSON line: {"baseUrl":"http://127.0.0.1:<port>","apiKey":"test-key-local"}.
// Only the fixed local test key is accepted; this is not a real credential.
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';

const API_KEY='test-key-local';
const MODELS=['fake-openai-chat','fake-openai-reasoner'];
const MAX_BODY_BYTES=1024*1024;

function send(response,status,payload){
  const body=JSON.stringify(payload);
  response.writeHead(status,{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)});
  response.end(body);
}
function unauthorized(request){return request.headers.authorization!==`Bearer ${API_KEY}`;}
function readBody(request){
  return new Promise((resolve,reject)=>{
    const chunks=[];let size=0;
    request.on('data',chunk=>{size+=chunk.length;if(size>MAX_BODY_BYTES){reject(new Error('body too large'));request.destroy();return;}chunks.push(chunk);});
    request.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error',reject);
  });
}
function completion(id,model,created){
  return {id,object:'chat.completion',created,model,choices:[{index:0,message:{role:'assistant',content:'fake-openai response'},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:2,total_tokens:3}};
}
function streamChunk(id,model,created,delta,finishReason=null){
  return {id,object:'chat.completion.chunk',created,model,choices:[{index:0,delta,finish_reason:finishReason}]};
}

const server=createServer(async (request,response)=>{
  const path=new URL(request.url??'/',`http://${request.headers.host??'127.0.0.1'}`).pathname;
  if((path==='/models'||path==='/v1/models')&&request.method==='GET'){
    if(unauthorized(request))return send(response,401,{error:{message:'Invalid API key',type:'invalid_request_error',code:'invalid_api_key'}});
    return send(response,200,{object:'list',data:MODELS.map(id=>({id,object:'model',created:1700000000,owned_by:'fake-openai'}))});
  }
  if((path==='/chat/completions'||path==='/v1/chat/completions')&&request.method==='POST'){
    if(unauthorized(request))return send(response,401,{error:{message:'Invalid API key',type:'invalid_request_error',code:'invalid_api_key'}});
    let body;
    try{body=JSON.parse(await readBody(request));}
    catch{return send(response,400,{error:{message:'Invalid JSON body',type:'invalid_request_error'}});}
    if(!body||typeof body!=='object'||typeof body.model!=='string')return send(response,400,{error:{message:'model is required',type:'invalid_request_error'}});
    const id='chatcmpl-'+randomUUID();
    const created=Math.floor(Date.now()/1000);
    if(body.stream===true){
      response.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
      const events=[
        streamChunk(id,body.model,created,{role:'assistant'}),
        streamChunk(id,body.model,created,{content:'fake-openai response'}),
        streamChunk(id,body.model,created,{},'stop'),
      ];
      for(const event of events)response.write(`data: ${JSON.stringify(event)}\n\n`);
      if(body.stream_options?.include_usage)response.write(`data: ${JSON.stringify({id,object:'chat.completion.chunk',created,model:body.model,choices:[],usage:{prompt_tokens:1,completion_tokens:2,total_tokens:3}})}\n\n`);
      response.write('data: [DONE]\n\n');
      return response.end();
    }
    return send(response,200,completion(id,body.model,created));
  }
  if(path==='/health')return send(response,200,{status:'ok'});
  return send(response,404,{error:{message:'Not found',type:'invalid_request_error'}});
});
server.listen(0,'127.0.0.1',()=>{
  const address=server.address();
  if(!address||typeof address==='string')throw new Error('Unexpected listen address');
  console.log(JSON.stringify({baseUrl:`http://127.0.0.1:${address.port}`,apiKey:API_KEY}));
});
function stop(){server.close(()=>process.exit(0));}
process.on('SIGINT',stop);
process.on('SIGTERM',stop);
