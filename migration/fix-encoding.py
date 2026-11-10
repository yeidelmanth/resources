"""Repair a file whose UTF-8 was read as Windows-1252 and saved again (â€º, ×ª…).

    python3 migration/fix-encoding.py in.js out.js

Bytes 0x81/0x8D/0x8F/0x90/0x9D survive as control characters and are restored;
non-breaking-space bytes that were turned into plain spaces are put back.
"""
import re, sys

def to_bytes(s):
    out = bytearray()
    for ch in s:
        o = ord(ch)
        if o < 128:
            out.append(o)
            continue
        try:
            out += ch.encode("cp1252")
        except UnicodeEncodeError:
            out.append(o)  # C1 control chars map straight back to their byte
    return bytes(out)

src, dst = sys.argv[1], sys.argv[2]
b = to_bytes(open(src, encoding="utf-8").read())
b = re.sub(rb"([\xc2-\xdf]) ", lambda m: m.group(1) + b"\xa0", b)
b = re.sub(rb"([\xe0-\xef]) ", lambda m: m.group(1) + b"\xa0", b)
b = re.sub(rb"([\xe0-\xef][\x80-\xbf]) ", lambda m: m.group(1) + b"\xa0", b)
t = b.decode("utf-8", errors="replace")
open(dst, "w", encoding="utf-8").write(t)
print(f"wrote {dst}; {t.count(chr(0xfffd))} unrecoverable characters")
