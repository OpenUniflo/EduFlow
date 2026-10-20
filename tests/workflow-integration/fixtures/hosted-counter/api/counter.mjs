// Temporary authenticated external-effect fixture. Never a product fallback.
import {createClient} from '@supabase/supabase-js';
import {timingSafeEqual} from 'node:crypto';
export default async function handler(request,response){
 const supplied=Buffer.from(request.headers.authorization??'');
 const expected=Buffer.from('Bearer '+process.env.P6_COUNTER_TOKEN);
 const apiKey=Buffer.from(request.headers['x-api-key']??'');const raw=Buffer.from(process.env.P6_COUNTER_TOKEN);
 if(!(supplied.length===expected.length&&timingSafeEqual(supplied,expected))&&!(apiKey.length===raw.length&&timingSafeEqual(apiKey,raw))){response.status(401).json({code:'UNAUTHORIZED'});return;}
 if(request.query.echo==='1'){response.status(200).json({echo:process.env.P6_COUNTER_TOKEN});return;}
 const key=String(request.query.key??'');
 if(!/^p6-[0-9a-f-]{36}$/.test(key)){response.status(400).json({code:'INVALID_FIXTURE_KEY'});return;}
 const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
 const {data,error}=await db.rpc('p6_acceptance_counter',{p_key:key,p_increment:request.method==='POST'});
 if(error){response.status(503).json({code:'COUNTER_STORAGE_UNAVAILABLE'});return;}
 // Commit precedes the deliberately lost/late reply. GET is always fast.
 if(request.method==='POST')await new Promise(resolve=>setTimeout(resolve,20000));
 response.status(200).json({count:data});
}
