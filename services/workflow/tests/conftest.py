"""Unit tests must never inherit host proxy configuration.

The OpenAI-compatible SDK builds proxy mounts from the process environment while
constructing a chat model. Host-level proxy variables (for example a sandbox
proxy whose NO_PROXY contains bracketed IPv6 entries) then make purely offline
adapter tests fail before any request is attempted. Tests that exercise proxy
behavior set their own variables explicitly.
"""
import pytest

PROXY_VARIABLES = (
    "http_proxy", "https_proxy", "all_proxy", "no_proxy",
    "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
)


@pytest.fixture(autouse=True)
def isolated_proxy_environment(monkeypatch):
    for name in PROXY_VARIABLES:
        monkeypatch.delenv(name, raising=False)
