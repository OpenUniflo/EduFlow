# Acceptance matrix for EduFlow PR3 / PR5 / PR6

| Stage | Case | Test evidence | Pass condition |
|---|---|---|---|
| PR3 | DeepSeek tool call | scripts/test_deepseek_tool_call.py output + worker trace | tool_calls -> verified HTTP result -> final response |
| PR3 | HTTP error handling | /fail/server-error, /fail/rate-limited | trace includes status and error, not mock success |
| PR3 | Tool authentication | /secure/orders/A1001 | missing key 401; test key 200 |
| PR3 | MCP discovery | Everything server through MCP Inspector | tools/list returns actual MCP tool metadata |
| PR5 | Skill loading | read skills/*/SKILL.md | metadata discovery -> full body read only when used |
| PR5 | Skill execution | data-analysis/scripts/analyze.py | JSON has 3 orders and 199.50 CNY total |
| PR5 | Checkpoint | langgraph-checkpoint-postgres with runtime DB | thread may resume after worker restart |
| PR5 | Sandbox | approved CSV script in container | no host filesystem / unsafe network access; Docker alone is not a strong untrusted-code security boundary |
| PR6 | Published workflow API | must be implemented in EduFlow | bearer key and scoped deployment permissions, 401/403/revocation |
| PR6 | External invocation | independent script/curl -> EduFlow API | real run_id, published version, output and trace |
| PR6 | Multi-tenant security | two Supabase test users | user A cannot read user B's private traces |

NOTE: WireMock's tool API authentication simulation is **not** a test of the published workflow's own deployment auth. PR6 requires testing the real EduFlow endpoint once built.
