"""HTTPS for the Station agent.

Pomfret uses plain urllib against pomfretastro.org (Let's Encrypt / ISRG Root X1), which
this observatory PC already trusts.

Borean uses www.boreanastro.com behind Cloudflare (Google Trust Services). That root is
often missing on older or locked-down Windows builds — Schannel fails even when Let's Encrypt
works. We ship a current Mozilla CA bundle (cacert.pem) built in CI and use it for HTTPS.
"""

from __future__ import annotations

import ssl
import sys
import urllib.request
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

_ssl_context: Optional[ssl.SSLContext] = None


def _bundled_ca_path() -> Optional[str]:
    path = Path(__file__).resolve().with_name("cacert.pem")
    return str(path) if path.is_file() else None


def https_ssl_context() -> ssl.SSLContext:
    global _ssl_context
    if _ssl_context is not None:
        return _ssl_context

    bundled = _bundled_ca_path()
    if bundled:
        ctx = ssl.create_default_context(cafile=bundled)
    else:
        ctx = ssl.create_default_context()

    try:
        import certifi

        ctx.load_verify_locations(cafile=certifi.where())
    except ImportError:
        pass

    if sys.platform == "win32":
        for store in ("ROOT", "CA"):
            for cert, encoding, _trust in ssl.enum_certificates(store):
                if encoding == "x509_asn":
                    try:
                        ctx.load_verify_locations(cadata=cert)
                    except ssl.SSLError:
                        pass

    _ssl_context = ctx
    return _ssl_context


def urlopen(req: urllib.request.Request, *, timeout: float):
    if urlparse(req.full_url).scheme == "https":
        return urllib.request.urlopen(req, timeout=timeout, context=https_ssl_context())
    return urllib.request.urlopen(req, timeout=timeout)


def ssl_ca_status() -> str:
    parts: list[str] = []
    bundled = _bundled_ca_path()
    if bundled:
        parts.append("bundled Mozilla CA (cacert.pem)")
    else:
        parts.append("system default (no bundled CA)")
    if sys.platform == "win32":
        parts.append("Windows ROOT+CA stores")
    try:
        import certifi

        parts.append(f"certifi ({certifi.where()})")
    except ImportError:
        parts.append("certifi not installed")
    return " + ".join(parts)
