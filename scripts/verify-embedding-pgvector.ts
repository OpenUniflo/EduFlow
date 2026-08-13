import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createEmbeddingService } from "../api/_lib/embedding.js";
import { readEmbeddingEnvironment } from "../api/_lib/env.js";

const samples = ["Tool Calling", "Function Calling", "工具调用", "Prompt Engineering", "Database Index"] as const;
const query = "Agent Function Calling";
const relatedLabels = ["Tool Calling", "Function Calling", "工具调用"] as const;

function sqlText(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlVector(vector: number[]): string {
  return sqlText(`[${vector.join(",")}]`);
}

const environment = readEmbeddingEnvironment();
const embeddingService = createEmbeddingService(environment);
const embeddings = await Promise.all(samples.map(async (label) => ({ label, embedding: await embeddingService.embed(label) })));
const queryEmbedding = await embeddingService.embed(query);
const rows = embeddings.map(({ label, embedding }) => `(
  ${sqlText(label)},
  ${sqlVector(embedding)}::extensions.vector(${environment.embeddingDimensions}),
  ${sqlText(environment.embeddingProvider)},
  ${sqlText(environment.embeddingModel)},
  ${environment.embeddingDimensions}
)`).join(",\n");
const related = relatedLabels.map(sqlText).join(", ");

const sql = `
do $$
begin
  if not exists (
    select 1
    from pg_extension extension
    join pg_namespace namespace on namespace.oid = extension.extnamespace
    where extension.extname = 'vector' and namespace.nspname = 'extensions'
  ) then
    raise exception 'vector extension is not installed in the extensions schema';
  end if;
end
$$;

create temp table embedding_preflight_samples (
  label text primary key,
  embedding extensions.vector(${environment.embeddingDimensions}) not null,
  embedding_provider text not null,
  embedding_model text not null,
  embedding_dimensions integer not null check (embedding_dimensions = ${environment.embeddingDimensions}),
  embedded_at timestamptz not null default now()
);

insert into embedding_preflight_samples (
  label, embedding, embedding_provider, embedding_model, embedding_dimensions
) values
${rows};

create temp table embedding_preflight_results as
select
  label,
  1 - (embedding <=> ${sqlVector(queryEmbedding)}::extensions.vector(${environment.embeddingDimensions})) as similarity
from embedding_preflight_samples;

do $$
declare
  wrong_dimension_rejected boolean := false;
  unrelated_similarity double precision;
  related_min_similarity double precision;
begin
  begin
    insert into embedding_preflight_samples (
      label, embedding, embedding_provider, embedding_model, embedding_dimensions
    ) values (
      'wrong-dimension', '[0,0]'::extensions.vector, ${sqlText(environment.embeddingProvider)}, ${sqlText(environment.embeddingModel)}, ${environment.embeddingDimensions}
    );
  exception when data_exception then
    wrong_dimension_rejected := true;
  end;

  if not wrong_dimension_rejected then
    raise exception 'PostgreSQL accepted a vector with the wrong dimensions';
  end if;

  select similarity into unrelated_similarity
  from embedding_preflight_results
  where label = 'Database Index';

  select min(similarity) into related_min_similarity
  from embedding_preflight_results
  where label in (${related});

  if related_min_similarity <= unrelated_similarity then
    raise exception 'Expected every tool/function-calling sample to rank above Database Index';
  end if;
end
$$;

select
  label,
  round(similarity::numeric, 6) as cosine_similarity
from embedding_preflight_results
order by similarity desc;
`;

const supabaseConfig = readFileSync("supabase/config.toml", "utf8");
const projectId = supabaseConfig.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
if (!projectId) throw new Error("Local pgvector verification could not resolve the Supabase project ID");

const result = spawnSync(
  "docker",
  ["exec", "-i", `supabase_db_${projectId}`, "psql", "--username", "postgres", "--dbname", "postgres", "--set", "ON_ERROR_STOP=1"],
  { cwd: process.cwd(), encoding: "utf8", input: sql }
);
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Local pgvector verification failed with exit code ${result.status ?? "unknown"}`);

console.log(`Embedding + pgvector preflight: passed (${embeddings.length} stored vectors, query ${sqlText(query)})`);
