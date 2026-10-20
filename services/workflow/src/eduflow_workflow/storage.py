"""Restricted DB-role adapter; transaction authority remains in SQL functions."""
from psycopg import AsyncConnection
from psycopg.types.json import Jsonb
from .contracts import ExecutionError

class Storage:
    def __init__(self,url): self.url=url
    async def call(self,name,*args):
        parameters=[Jsonb(value) if isinstance(value,(dict,list)) else value for value in args]
        async with await AsyncConnection.connect(self.url, connect_timeout=5, tcp_user_timeout=20000, options='-c statement_timeout=15000 -c lock_timeout=3000') as connection:
            try:
                cursor=await connection.execute("select workflow_private."+name+"("+",".join("%s" for _ in args)+")",parameters)
                row=await cursor.fetchone()
                return row[0]
            except Exception as error:
                code=getattr(getattr(error,'diag',None),'message_primary','')
                if code in {'IMMUTABLE_VERSION','CATALOG_NOT_FOUND','SECRET_REVOKED'}:
                    raise ExecutionError(code,'Version is immutable; choose a new version' if code=='IMMUTABLE_VERSION' else 'Catalog entry is unavailable','auth' if code=='SECRET_REVOKED' else 'validation',effect='none') from None
                if code in {'CATALOG_PAYLOAD_TOO_LARGE','CATALOG_QUOTA_EXCEEDED'}: raise ExecutionError(code,'Shared discovery capacity exceeded; ask an operator to review obsolete connection versions','policy',effect='none') from None
                if code=='EXTERNAL_EFFECT_UNCERTAIN':raise ExecutionError(code,'An accessible source has an uncertain external write; replay is blocked','policy',effect='unknown') from None
                known={'MEMORY_VERSION_CONFLICT','MEMORY_QUOTA_EXCEEDED','ROUND_BUDGET_EXCEEDED','ATTEMPT_BUDGET_EXCEEDED','RUN_TIMEOUT','LEASE_LOST','RUN_CANCELLED','NODE_BUDGET_EXCEEDED','TOOL_BUDGET_EXCEEDED','EXTERNAL_EFFECT_UNCERTAIN','TASK_RESULT_CONFLICT','STATE_VERSION_CONFLICT'}
                if code in known: raise ExecutionError(code,code.replace('_',' '),'timeout' if code=='RUN_TIMEOUT' else 'policy' if 'BUDGET' in code or code=='RUN_CANCELLED' else 'infrastructure',effect='unknown') from None
                raise
    async def check(self,run,token,extend=False):
        try: result=await self.call("check_lease",run,token,extend)
        except ExecutionError: raise
        except Exception as error:
            if "RUN_TIMEOUT" in str(error): raise ExecutionError("RUN_TIMEOUT","Thread compute budget exhausted","timeout",effect="unknown") from None
            raise ExecutionError("LEASE_LOST","Worker lease/storage access lost","infrastructure",effect="unknown") from None
        if result["cancelled"]: raise ExecutionError("RUN_CANCELLED","Cancellation requested","policy",effect="unknown")
        return result
