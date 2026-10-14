---
name: api-operator
description: Query simulated enterprise orders with a read-only HTTP tool. Use when asked about orders A1001 or A1002.
---
# Read enterprise orders
1. Read `references/order-api.md` before selecting the tool.
2. Query only the specified order ID using the approved read-only HTTP tool.
3. If status is 401, 403, 429, or 500, do not fabricate an order result.
4. Return order_id, status, total and currency, and label the result as simulated test data.
