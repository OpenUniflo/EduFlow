from datetime import datetime, timezone

import pytest

from eduflow_workflow.contracts import ExecutionError
from eduflow_workflow.registry import transform
from eduflow_workflow.ted_lots import evaluate_lot, lot_query, normalize_lots


def test_lot_query_matches_both_publication_number_forms():
    assert '"00795977-2026" "795977-2026"' in lot_query("795977-2026")
    with pytest.raises(ExecutionError, match="Invalid TED publication number"):
        lot_query('795977-2026" } UNION {')


def test_selected_lot_uses_its_own_offset_aware_deadline():
    def row(identifier, deadline):
        return {"id": {"value": identifier}, "title": {"value": identifier},
                "deadline": {"value": deadline}}

    lots = normalize_lots([
        row("LOT-0001", "2026-11-30T12:00:00+01:00"),
        row("LOT-0002", "2026-12-05T12:00:00+01:00"),
        row("GLO-0001", "2026-12-20T00:00:00Z"),
    ])
    now = datetime(2026, 12, 1, tzinfo=timezone.utc)
    assert evaluate_lot(lots, "LOT-0001", now=now)["status"] == "expired"
    assert evaluate_lot(lots, "LOT-0002", now=now)["status"] == "open"
    assert evaluate_lot(lots, "GLO-0001", now=now)["status"] == "invalid"


def test_ambiguous_dates_and_returns_preserve_other_fields():
    rows = [{"id": {"value": "LOT-0001"}, "deadline": {"value": date}}
            for date in ("2026-11-30T12:00:00+01:00", "2026-12-05T12:00:00+01:00")]
    assert evaluate_lot(normalize_lots(rows), "LOT-0001")["status"] == "unknown"
    result = transform("core.reopenTextFields", {
        "values": {"company": "kept", "ability": "old", "other": 5},
        "fields": ["能力"], "fieldMap": {"公司": "company", "能力": "ability"},
    })
    assert result == {"values": {"company": "kept", "ability": ""}}
