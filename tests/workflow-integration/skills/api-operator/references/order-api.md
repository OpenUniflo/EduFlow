# EduFlow simulated orders API
Base URL on host: `http://127.0.0.1:18080`.
- `GET /orders/A1001` returns an example shipped order.
- `GET /orders/A1002` returns a pending order.
- `GET /secure/orders/A1001` requires `X-Tool-Key: tool-test-key`.
- `GET /secure/admin` returns 403 with the test key.
All orders are fictional. For containers attached to the Compose network, address the server as `http://wiremock:8080`.
