"""Optional Worker observability; no execution data, authority or cache contents."""
from .compiler import cache_info
from .contracts import DEPENDENCY_MANIFEST

def record_cache_info():
    """Publish only aggregate Worker counters to the trusted local service boundary."""
    import json
    import os
    from pathlib import Path
    from datetime import datetime,timezone
    path=os.environ.get("WORKFLOW_CACHE_INFO_FILE")
    if not path and os.environ.get("WORKFLOW_CATALOG_FILE"): path=os.environ["WORKFLOW_CATALOG_FILE"]+".cache-info.json"
    if not path: return
    payload={"cacheInfo":cache_info(),"executorDigest":DEPENDENCY_MANIFEST["executorDigest"],"observedAt":datetime.now(timezone.utc).isoformat(),"processId":os.getpid()}
    destination=Path(path);temporary=Path(path+".tmp-"+str(os.getpid()))
    try:
        temporary.write_text(json.dumps(payload));temporary.chmod(0o600);temporary.replace(destination)
    except OSError:
        # Optional observability must not affect execution or disclose filesystem paths.
        try: temporary.unlink(missing_ok=True)
        except OSError: pass
