"""Operator-only health signals. Never serialize exception text or product data."""
import asyncio
import json
import os
import sys
import time
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from uuid import UUID, uuid4

INSTANCE_ID = str(uuid4())
_last_published = {}
_last_alerts = {}
from .contracts import DEPENDENCY_MANIFEST

ROLES = {'worker', 'watchdog'}


def alert(code):
    if code not in {'WORKER_SIGNAL_STALE', 'QUEUE_DELAY_EXCEEDED'}:
        raise ValueError('Invalid operator alert')
    now = time.monotonic()
    if now - _last_alerts.get(code, -100) >= 30:
        print(json.dumps({'event':'workflow.operator.alert','code':code,
                         'executorDigest':DEPENDENCY_MANIFEST['executorDigest']}),file=sys.stderr,flush=True)
        _last_alerts[code] = now


async def observe(storage):
    metrics = await storage.call('p6_metrics',DEPENDENCY_MANIFEST['executorDigest'])
    if not metrics['worker']: alert('WORKER_SIGNAL_STALE')
    if metrics['oldestQueueSeconds'] > 40: alert('QUEUE_DELAY_EXCEEDED')
    return metrics


def signal(role, status='ok', code=None):
    if role not in ROLES or status not in {'ok', 'error', 'draining'}:
        raise ValueError('Invalid service signal')
    payload = {'role': role, 'status': status, 'observedAt': time.time(),
               'executorDigest': DEPENDENCY_MANIFEST['executorDigest']}
    # All codes are supplied by the service; no raw error messages are accepted.
    if code in {'STORAGE_UNAVAILABLE', 'EXECUTION_FAILED', 'SANDBOX_REAP_FAILED'}:
        payload['code'] = code
    directory = os.environ.get('WORKFLOW_HEALTH_DIRECTORY')
    if directory:
        path = Path(directory) / (role + '.json')
        temporary = path.with_suffix('.tmp-' + str(os.getpid()))
        try:
            temporary.write_text(json.dumps(payload)); temporary.chmod(0o600); temporary.replace(path)
        except OSError:
            try: temporary.unlink(missing_ok=True)
            except OSError: pass
    if status != 'ok':
        # Fixed-shape, credential-free event for journald/collector alerting.
        print(json.dumps(payload), file=sys.stderr, flush=True)


def service_status(role, now=None):
    """Reads one local role signal without requiring the caller's executor digest."""
    directory = os.environ.get('WORKFLOW_HEALTH_DIRECTORY')
    if not directory:
        return None
    try:
        payload = json.loads((Path(directory) / (role + '.json')).read_text())
        age = (time.time() if now is None else now) - payload['observedAt']
        if payload['role'] == role and payload['status'] == 'ok' and 0 <= age <= 20:
            return payload
    except (OSError, ValueError, TypeError, KeyError):
        pass
    return None


def service_signal(role, now=None):
    payload = service_status(role, now)
    return bool(payload and payload.get('executorDigest') == DEPENDENCY_MANIFEST['executorDigest'])


def _log_runner_digest_mismatch(worker_digest):
    """Version skew is expected between a Preview compiler and the Production Worker."""
    if worker_digest and worker_digest != DEPENDENCY_MANIFEST['executorDigest']:
        print(json.dumps({'event': 'workflow.runner.digest_mismatch',
                          'compilerDigest': DEPENDENCY_MANIFEST['executorDigest'],
                          'workerDigest': worker_digest}), file=sys.stderr, flush=True)


async def runner_status():
    """Returns whether any Worker recently signalled health; executor digest is not a gate."""
    if os.environ.get('WORKFLOW_DEPLOYMENT_MODE') == 'hosted':
        from .storage import Storage
        try:
            state = await asyncio.wait_for(Storage(os.environ['WORKFLOW_DATABASE_URL']).call('p6_worker_status'), 4)
        except Exception:
            return {'online': False}
        if not isinstance(state, dict):
            return {'online': False}
        _log_runner_digest_mismatch(state.get('executorDigest'))
        return {'online': state.get('online') is True}
    state = service_status('worker')
    if not state:
        return {'online': False}
    _log_runner_digest_mismatch(state.get('executorDigest'))
    return {'online': True}


async def publish(role, status='ok', code=None):
    signal(role, status, code)
    if os.environ.get('WORKFLOW_DEPLOYMENT_MODE') != 'hosted':
        return
    now = time.monotonic()
    if status == 'ok' and now - _last_published.get((role,status), -100) < 5:
        return
    from .storage import Storage
    await Storage(os.environ['WORKFLOW_DATABASE_URL']).call('p6_signal', role, INSTANCE_ID,
        DEPENDENCY_MANIFEST['executorDigest'], status)
    _last_published[(role,status)] = now


def assert_hosted_configuration():
    """Fail closed at process startup; Local behavior remains explicitly opt-in."""
    if os.environ.get('WORKFLOW_DEPLOYMENT_MODE') != 'hosted':
        return
    try:
        if os.environ.get('WORKFLOW_ALLOW_LOCAL_FIXTURES') == '1': raise ValueError()
        import re
        if os.environ.get('WORKFLOW_SANDBOX_BACKEND') != 'vercel' or not re.fullmatch(r'.+@sha256:[0-9a-f]{64}',os.environ.get('WORKFLOW_SANDBOX_IMAGE','')): raise ValueError()
        if len(os.environ.get('WORKFLOW_INTERNAL_TOKEN', '')) < 32: raise ValueError()
        database = urlsplit(os.environ['WORKFLOW_DATABASE_URL'])
        if (database.scheme not in {'postgres', 'postgresql'} or not database.password
                or not database.hostname or database.hostname in {'localhost', '127.0.0.1', '::1'}
                or database.username.split('.')[0] != 'workflow_worker'
                or parse_qs(database.query).get('sslmode', [''])[0] not in {'require', 'verify-ca', 'verify-full'}): raise ValueError()
        environments = json.loads(os.environ['WORKFLOW_ENVIRONMENTS_JSON'])['environments']
        if not environments: raise ValueError()
        for env in environments:
            if env.get('localFixtures'): raise ValueError()
            access = env.get('access', 'owners')
            if access not in {'owners', 'authenticated'}: raise ValueError()
            if access == 'authenticated':
                if env.get('ownerIds'): raise ValueError()
                if any(env.get(field) for field in ('providers', 'connectors', 'tools', 'variables', 'functions')): raise ValueError()
                continue
            if not env.get('ownerIds'): raise ValueError()
            for owner in env['ownerIds']: UUID(owner)
            for item in [*env.get('providers', []), *env.get('connectors', []), *env.get('tools', [])]:
                for key in ('baseUrl', 'url'):
                    if key in item:
                        url = urlsplit(item[key])
                        if (url.scheme != 'https' or not url.hostname or url.username or url.password
                                or url.hostname in {'localhost', '127.0.0.1', '::1'}): raise ValueError()
                ref = item.get('secretRef')
                if ref and not ref.startswith('vault:') and not os.environ.get(ref): raise ValueError()
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        raise RuntimeError('HOSTED_CONFIGURATION_INVALID: check operator configuration') from None


async def database_ready():
    from psycopg import AsyncConnection
    async def check():
        async with await AsyncConnection.connect(os.environ['WORKFLOW_DATABASE_URL'], connect_timeout=3, tcp_user_timeout=20000, options='-c statement_timeout=15000 -c lock_timeout=3000') as connection:
            row = await (await connection.execute("select to_regprocedure('workflow_private.p5_sweep()') is not null, to_regclass('workflow_checkpoints.checkpoints') is not null, to_regclass('workflow_memory.store') is not null")).fetchone()
            return bool(row and all(row))
    try:
        return await asyncio.wait_for(check(), 4)
    except Exception:
        return False


async def readiness():
    from .sandbox import available
    checks = {'database': await database_ready(), 'worker': service_signal('worker'),
              'watchdog': service_signal('watchdog')}
    if os.environ.get('WORKFLOW_DEPLOYMENT_MODE') == 'hosted' and checks['database']:
        from .storage import Storage
        try:
            checks.update(await asyncio.wait_for(Storage(os.environ['WORKFLOW_DATABASE_URL']).call(
                'p6_health', DEPENDENCY_MANIFEST['executorDigest']), 4))
        except Exception:
            checks['worker'] = checks['watchdog'] = False
    try:
        checks['sandbox'] = all((await asyncio.wait_for(available(), 5)).values())
    except Exception:
        checks['sandbox'] = False
    return {'status': 'ready' if all(checks.values()) else 'not_ready', 'checks': checks,
            'executorDigest': DEPENDENCY_MANIFEST['executorDigest']}
