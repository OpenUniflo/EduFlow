-- Keep existing model vectors and fixed 1024-dimensional validation; retrieval
-- already scopes to the requested model and current Knowledge revision.
alter table public.knowledge_node_revision_embeddings
 drop constraint knowledge_node_revision_embeddings_model_check;
alter table public.knowledge_node_revision_embeddings
 add constraint knowledge_node_revision_embeddings_model_check
 check (model in ('text-embedding-3-small', 'qwen3.7-text-embedding'));
