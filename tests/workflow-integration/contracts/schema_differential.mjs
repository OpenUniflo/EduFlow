import { schemaDiagnostics, validateSchemaValue } from '../../../src/features/workflow/domain/v2/validation.ts';
import { readFileSync } from 'node:fs';
const examples = JSON.parse(readFileSync(process.argv[2], 'utf8'));
process.stdout.write(JSON.stringify(examples.map(({id,schema,value})=>({id,schemaValid:schemaDiagnostics(schema).length===0,valueValid:validateSchemaValue(schema,value).valid}))));
