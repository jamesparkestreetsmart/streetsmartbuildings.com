"""Shared utilities for finance scripts."""


def ticker_normalize(raw: str) -> str:
    """Normalize a raw ticker string to canonical format.

    - Uppercase
    - Replace / and . with -
    - Collapse double dashes
    - Strip whitespace

    Examples:
        'BRK.B'  -> 'BRK-B'
        'BF.B'   -> 'BF-B'
        ' aapl ' -> 'AAPL'
        'BRK/B'  -> 'BRK-B'
    """
    t = raw.strip().upper()
    t = t.replace("/", "-").replace(".", "-")
    while "--" in t:
        t = t.replace("--", "-")
    return t
