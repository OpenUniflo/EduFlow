"""Thin official-saver adapter: checkpoint and product commit share a transaction."""
import copy
import hashlib
from contextlib import asynccontextmanager
from psycopg import AsyncConnection
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from .compiler import decode_state, SDK_SCOPE
from .contracts import ExecutionError, validate_value, canonical


def checkpoint_digest(serde, value):
    """Hash complete SDK semantics; official serde owns non-JSON leaf types.

    Canonical collection order is for hashing only. Saver still receives the
    original checkpoint and exclusively owns its persisted representation.
    """
    def fingerprint(item):
        if isinstance(item,dict):
            parts=sorted((fingerprint(key),fingerprint(child)) for key,child in item.items())
            data=b'dict'+b''.join(key+child for key,child in parts)
        elif isinstance(item,(list,tuple,set,frozenset)):
            parts=[fingerprint(child) for child in item]
            if isinstance(item,(set,frozenset)): parts.sort()
            data=type(item).__name__.encode()+b''.join(parts)
        else:
            kind,raw=serde.dumps_typed(item)
            data=kind.encode()+b'\0'+raw
        return hashlib.sha256(data).digest()
    return fingerprint(value).hex()


def business_state(execution, checkpoint, metadata):
    initialized = metadata.get('step', -1) >= 0
    definition=(SDK_SCOPE.get() or {}).get('definition',execution.root_definition)
    state = decode_state(definition, checkpoint['channel_values'])
    if initialized:
        execution.assert_no_secrets(state)
        validate_value(definition['state']['schema'], state, 'INVALID_STATE_UPDATE')
        if len(canonical(state)) > execution.definition['policy']['maxStateBytes']:
            raise ExecutionError('STATE_TOO_LARGE', 'Merged State exceeds budget', 'policy')
    return state, initialized


class PostgresCoordinator(BaseCheckpointSaver):
    """Delegate serialization/queries to the official SDK; never run SDK setup here."""
    def __init__(self, execution):
        super().__init__()
        self.execution = execution

    @asynccontextmanager
    async def connection(self):
        async with await AsyncConnection.connect(self.execution.storage.url, connect_timeout=5, tcp_user_timeout=20000, autocommit=True,
                row_factory=dict_row, options='-c search_path=workflow_checkpoints,workflow_memory -c statement_timeout=15000 -c lock_timeout=3000') as connection:
            yield connection

    async def fenced(self, connection):
        cursor = await connection.execute('select workflow_private.check_lease(%s,%s)',
                (self.execution.run['run_id'], self.execution.token))
        result = (await cursor.fetchone())['check_lease']
        if result['cancelled']:
            raise ExecutionError('RUN_CANCELLED', 'Cancellation requested', 'policy', effect='unknown')

    async def aget_tuple(self, config):
        async with self.connection() as connection:
            await self.fenced(connection)
            return await AsyncPostgresSaver(connection).aget_tuple(config)

    async def alist(self, config, *, filter=None, before=None, limit=None):
        async with self.connection() as connection:
            await self.fenced(connection)
            async for item in AsyncPostgresSaver(connection).alist(config, filter=filter, before=before, limit=limit):
                yield item

    async def aput_writes(self, config, writes, task_id, task_path=''):
        async with self.connection() as connection:
            async with connection.transaction():
                await self.fenced(connection)
                await AsyncPostgresSaver(connection).aput_writes(config, writes, task_id, task_path)

    async def aput(self, config, checkpoint, metadata, new_versions):
        try:
            return await self._put(config, checkpoint, metadata, new_versions)
        except ExecutionError:
            raise
        except Exception:
            raise ExecutionError('CHECKPOINT_COMMIT_FAILED','Checkpoint or State persistence failed','infrastructure',effect='unknown') from None

    async def _put(self, config, checkpoint, metadata, new_versions):
        execution = self.execution
        state, initialized = business_state(execution, checkpoint, metadata)
        metadata={**metadata,'eduflowRunId':str(execution.run['run_id'])}
        async with self.connection() as connection:
            async with connection.transaction():
                await self.fenced(connection)
                from .session_memory_history import commit_intents
                await commit_intents(connection,execution,config['configurable'].get('checkpoint_id'),config['configurable'].get('checkpoint_ns',''))
                result = await AsyncPostgresSaver(connection).aput(config, checkpoint, metadata, new_versions)
                namespace=config['configurable'].get('checkpoint_ns','')
                args=(execution.run['run_id'],execution.token,checkpoint['id'],config['configurable'].get('checkpoint_id'),Jsonb(state),initialized,checkpoint_digest(self.serde,{'parent':config['configurable'].get('checkpoint_id'),'checkpoint':checkpoint,'metadata':metadata,'versions':new_versions}))
                if namespace:
                    cursor=await connection.execute('select workflow_private.commit_scope(%s,%s,%s,%s,%s,%s,%s,%s)',(*args,namespace))
                    await cursor.fetchone()
                else:
                    cursor=await connection.execute('select workflow_private.commit_superstep(%s,%s,%s,%s,%s,%s,%s)',args)
                    version=(await cursor.fetchone())['commit_superstep']
                    execution.state_version=max(execution.state_version,version)
        return result


class MemoryCoordinator(InMemorySaver):
    """Unit-test storage adapter only; a database failure never selects this saver."""
    def __init__(self, execution):
        super().__init__()
        self.execution = execution

    async def aput(self, config, checkpoint, metadata, new_versions):
        try:
            return await self._put(config, checkpoint, metadata, new_versions)
        except ExecutionError:
            raise
        except Exception:
            raise ExecutionError('CHECKPOINT_COMMIT_FAILED','Checkpoint or State persistence failed','infrastructure',effect='unknown') from None

    async def _put(self, config, checkpoint, metadata, new_versions):
        execution = self.execution
        state, initialized = business_state(execution, checkpoint, metadata)
        parent = config['configurable'].get('checkpoint_id')
        receipts = [r for r in execution._prepared.values() if r['checkpoint_id'] == parent and not r.get('committed')]
        before = copy.deepcopy(execution.storage.__dict__)
        try:
            for receipt in receipts:
                await execution.storage.call('step_complete', execution.run['run_id'], execution.token,
                        receipt['step_id'], receipt['output'], state, receipt['patch'], execution.state_version, receipt['usage'])
            result = await super().aput(config, checkpoint, metadata, new_versions)
        except BaseException:
            execution.storage.__dict__.clear()
            execution.storage.__dict__.update(before)
            raise
        execution.state_version += int(any(r['patch'] for r in receipts))
        for receipt in receipts:
            receipt['committed'] = True
        return result
