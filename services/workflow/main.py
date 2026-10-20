"""Vercel FastAPI entrypoint; no daemon or migration runs inside a request."""
from eduflow_workflow.operations import assert_hosted_configuration
assert_hosted_configuration()
from eduflow_workflow.server import app
