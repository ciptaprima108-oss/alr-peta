#!/usr/bin/env python3
"""Tanda tangani APK dengan APK Signature Scheme v2 (cukup untuk Android 7.0+ / minSdk 24).

Pakai:  python3 tanda_tangan_apk.py masuk-unsigned.apk keluar.apk kunci.p12 PASSWORD

Dipakai karena Android build-tools (apksigner) tidak selalu tersedia. Kunci (.p12/.jks)
disimpan privat, tidak pernah masuk ke repo.
"""
import hashlib
import struct
import sys

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import pkcs12

SIG_RSA_PKCS1_SHA256 = 0x0103
V2_ID = 0x7109871A
MAGIC = b"APK Sig Block 42"
CHUNK = 1024 * 1024


def lp(b: bytes) -> bytes:
    return struct.pack("<I", len(b)) + b


def cari_eocd(data: bytes) -> int:
    for i in range(len(data) - 22, max(-1, len(data) - 22 - 65536), -1):
        if data[i:i + 4] == b"PK\x05\x06":
            clen = struct.unpack("<H", data[i + 20:i + 22])[0]
            if i + 22 + clen == len(data):
                return i
    raise SystemExit("EOCD tidak ketemu")


def digest_bagian(bagian):
    chunks = []
    for b in bagian:
        for o in range(0, len(b), CHUNK):
            c = b[o:o + CHUNK]
            chunks.append(hashlib.sha256(b"\xa5" + struct.pack("<I", len(c)) + c).digest())
    return hashlib.sha256(b"\x5a" + struct.pack("<I", len(chunks)) + b"".join(chunks)).digest()


def cek_align(data: bytes, cd_off: int):
    """resources.arsc harus STORED dan 4-byte aligned (targetSdk 30+)."""
    o = 0
    while o < cd_off and data[o:o + 4] == b"PK\x03\x04":
        method, = struct.unpack("<H", data[o + 8:o + 10])
        csize, = struct.unpack("<I", data[o + 18:o + 22])
        nlen, elen = struct.unpack("<HH", data[o + 26:o + 30])
        name = data[o + 30:o + 30 + nlen].decode()
        start = o + 30 + nlen + elen
        if name == "resources.arsc" and (method != 0 or start % 4):
            raise SystemExit("resources.arsc tidak STORED/aligned")
        flags, = struct.unpack("<H", data[o + 6:o + 8])
        if flags & 0x08:
            raise SystemExit("APK pakai data descriptor, tidak didukung skrip ini")
        o = start + csize


def main(src, dst, p12, pw):
    data = open(src, "rb").read()
    eocd = cari_eocd(data)
    cd_off, = struct.unpack("<I", data[eocd + 16:eocd + 20])
    cd_size, = struct.unpack("<I", data[eocd + 12:eocd + 16])
    assert cd_off + cd_size == eocd, "ada data antara central directory dan EOCD"
    if data[cd_off - 16:cd_off] == MAGIC:
        raise SystemExit("APK sudah bertanda tangan")
    cek_align(data, cd_off)

    key, cert, _ = pkcs12.load_key_and_certificates(open(p12, "rb").read(), pw.encode())
    cert_der = cert.public_bytes(serialization.Encoding.DER)
    pub_der = key.public_key().public_bytes(serialization.Encoding.DER,
                                            serialization.PublicFormat.SubjectPublicKeyInfo)

    isi, cd, ujung = data[:cd_off], data[cd_off:eocd], data[eocd:]
    dg = digest_bagian([isi, cd, ujung])  # EOCD belum diubah: offset CD = awal signing block

    signed_data = (lp(lp(struct.pack("<I", SIG_RSA_PKCS1_SHA256) + lp(dg)))
                   + lp(lp(cert_der))
                   + lp(b""))
    sig = key.sign(signed_data, padding.PKCS1v15(), hashes.SHA256())
    signer = lp(signed_data) + lp(lp(struct.pack("<I", SIG_RSA_PKCS1_SHA256) + lp(sig))) + lp(pub_der)
    v2 = lp(lp(signer))

    pair = struct.pack("<I", V2_ID) + v2
    pairs = struct.pack("<Q", len(pair)) + pair
    size = len(pairs) + 8 + 16  # pairs + size akhir + magic
    blok = struct.pack("<Q", size) + pairs + struct.pack("<Q", size) + MAGIC

    ujung_baru = bytearray(ujung)
    ujung_baru[16:20] = struct.pack("<I", cd_off + len(blok))
    open(dst, "wb").write(isi + blok + cd + bytes(ujung_baru))
    print("OK:", dst, "sha256 sertifikat:", hashlib.sha256(cert_der).hexdigest())


if __name__ == "__main__":
    if len(sys.argv) != 5:
        raise SystemExit(__doc__)
    main(*sys.argv[1:])
