"""The skeleton has no dependencies and no install step: make it importable from this directory."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
