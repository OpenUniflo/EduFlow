"""Read-only lot records from the Publications Office eProcurement data."""
import re
from datetime import datetime, timezone

from .contracts import ExecutionError


def lot_query(publication_number):
    if not re.fullmatch(r"[0-9]{1,8}-[0-9]{4}", publication_number):
        raise ExecutionError("INVALID_TED_PUBLICATION", "Invalid TED publication number", "validation")
    number, year = publication_number.split("-")
    numbers = dict.fromkeys((f"{int(number):08d}-{year}", f"{int(number)}-{year}"))
    identifiers = " ".join(f'"{value}"' for value in numbers)
    return f"""
PREFIX epo: <http://data.europa.eu/a4g/ontology#>
PREFIX adms: <http://www.w3.org/ns/adms#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX dct: <http://purl.org/dc/terms/>
SELECT ?id (SAMPLE(?name) AS ?title) (SAMPLE(?record) AS ?lot) ?deadline WHERE {{
 VALUES ?number {{ {identifiers} }}
 ?notice epo:hasNoticePublicationNumber ?number ; epo:announcesLot ?record .
 ?record adms:identifier/skos:notation ?id .
 OPTIONAL {{ ?record dct:title ?name . }}
 OPTIONAL {{
   ?record epo:isSubjectToLotSpecificTerm ?term .
   ?term epo:hasReceiptTenderDeadline ?deadline .
 }}
}}
GROUP BY ?id ?deadline
ORDER BY ?id ?deadline
LIMIT 201
""".strip()


def _value(row, name):
    cell = row.get(name)
    value = cell.get("value") if isinstance(cell, dict) else None
    return value if isinstance(value, str) else ""


def normalize_lots(rows):
    if len(rows) > 200:
        raise ExecutionError("TED_LOT_LIMIT", "Too many lot records to review completely", "policy")
    lots = {}
    for row in rows:
        identifier = _value(row, "id")
        if not re.fullmatch(r"LOT-[0-9]{4,}", identifier):
            continue
        lot = lots.setdefault(identifier, {
            "id": identifier, "title": _value(row, "title") or identifier,
            "deadline": "", "deadlines": [],
        })
        deadline = _value(row, "deadline")
        if deadline and deadline not in lot["deadlines"]:
            lot["deadlines"].append(deadline)
    for lot in lots.values():
        if len(lot["deadlines"]) == 1:
            lot["deadline"] = lot["deadlines"][0]
    return list(lots.values())


def evaluate_lot(lots, identifier, *, now=None):
    selected = next((lot for lot in lots if lot.get("id") == identifier), None)
    if selected is None:
        return {"lot": {}, "status": "invalid"}
    deadline = selected.get("deadline", "")
    try:
        instant = datetime.fromisoformat(deadline.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return {"lot": selected, "status": "unknown"}
    if instant.utcoffset() is None:
        return {"lot": selected, "status": "unknown"}
    expired = instant <= (now if now is not None else datetime.now(timezone.utc))
    return {"lot": selected, "status": "expired" if expired else "open"}
