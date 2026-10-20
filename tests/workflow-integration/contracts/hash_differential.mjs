import { canonicalSemanticJson } from '../../../src/features/workflow/domain/v2/validation.ts';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const examples = JSON.parse(readFileSync(process.argv[2], 'utf8'));
process.stdout.write(JSON.stringify(examples.map(({id,definition})=>(()=>{try{return {id,accepted:true,hash:createHash('sha256').update(canonicalSemanticJson(definition)).digest('hex')}}catch{return {id,accepted:false}}})())));
