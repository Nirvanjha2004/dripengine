import yaml
import os
from typing import Optional

# Check for an environment variable first, default to local relative path
SEQUENCES_DIR = os.getenv("SEQUENCES_DIR", os.path.join(
    os.path.dirname(__file__), "../../../../sequences"
))

_cache: dict = {}


def load_sequence(sequence_id: str) -> Optional[dict]:
    """
    Loads a sequence definition from a YAML file.
    Caches it in memory after first load so we don't hit disk on every request.

    Expected file path:
        sequences/{sequence_id}.yaml

    Returns None if the sequence file doesn't exist.
    """
    if sequence_id in _cache:
        return _cache[sequence_id]

    path = os.path.join(SEQUENCES_DIR, f"{sequence_id}.yaml")

    if not os.path.exists(path):
        return None

    with open(path, "r") as f:
        data = yaml.safe_load(f)

    _cache[sequence_id] = data
    return data


def parse_delay(delay_str) -> int:
    """
    Converts a human-readable delay string into seconds.

    Examples:
        0       → 0
        "1d"    → 86400
        "12h"   → 43200
        "30m"   → 1800
        "5d"    → 432000
    """
    if delay_str == 0 or delay_str == "0":
        return 0

    delay_str = str(delay_str).strip()

    if delay_str.endswith("d"):
        return int(delay_str[:-1]) * 86400
    elif delay_str.endswith("h"):
        return int(delay_str[:-1]) * 3600
    elif delay_str.endswith("m"):
        return int(delay_str[:-1]) * 60
    else:
        return int(delay_str)