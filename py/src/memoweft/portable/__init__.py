"""便携记忆包(Portable Memory Bundle)—— 移植自 src/portable(1.3 · D-0042 · Phase 1c)。

parity:validate_bundle 逐字对拍 shared/parity/bundle-validate.json;import_bundle 往返对拍 shared/parity/bundle.json。
"""
from __future__ import annotations

from .importer import ImportCounts, import_bundle
from .model import BUNDLE_FORMAT, BUNDLE_SCHEMA_VERSION
from .validate import ValidateResult, validate_bundle

__all__ = [
    "BUNDLE_FORMAT",
    "BUNDLE_SCHEMA_VERSION",
    "ValidateResult",
    "validate_bundle",
    "ImportCounts",
    "import_bundle",
]
