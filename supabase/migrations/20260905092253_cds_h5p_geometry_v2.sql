-- Keep the content/Step identity and historical /1 assets. A corrected package
-- gets a new immutable revision; replay must never clear an imported /2 checksum.
update public.h5p_contents
set revision=2,
    storage_path='cds525-h5p-k001-rule-vs-learning/2',
    status='draft',
    package_sha256=null,
    updated_at=now()
where id='cds525-h5p-k001-rule-vs-learning' and revision<2;
