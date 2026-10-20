"""MessageV1 adapters; provider opaque continuation remains in run-local memory."""
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

def to_langchain(message):
    if message.get('role')=='remove':
        from langchain_core.messages import RemoveMessage
        return RemoveMessage(id=message['id'])
    text = "".join(block["text"] for block in message["content"] if block["type"]=="text")
    common = {"content":text,"id":message["id"]}
    if message["role"]=="assistant": return AIMessage(**common,tool_calls=[{"id":call["id"],"name":call["name"],"args":call["arguments"],"type":"tool_call"} for call in message.get("toolCalls",[])])
    if message["role"]=="tool": return ToolMessage(**common,tool_call_id=message["toolCallId"])
    return (SystemMessage if message["role"]=="system" else HumanMessage)(**common)

def from_langchain(message):
    import uuid
    content = message.content
    if isinstance(content,str): blocks=[{"type":"text","text":content}]
    else: blocks=[{"type":"text","text":block if isinstance(block,str) else block["text"]} for block in content if isinstance(block,str) or isinstance(block,dict) and block.get("type")=="text"]
    role = {"human":"user","ai":"assistant"}.get(message.type,message.type)
    result={"id":message.id or str(uuid.uuid4()),"role":role,"content":blocks}
    if role=="assistant": result["toolCalls"]=[{"id":call["id"],"name":call["name"],"arguments":call["args"]} for call in message.tool_calls]
    if role=="tool": result["toolCallId"]=message.tool_call_id
    return result
