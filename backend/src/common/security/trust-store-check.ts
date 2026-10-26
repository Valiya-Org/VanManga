import { X509Certificate } from 'node:crypto';
import { rootCertificates } from 'node:tls';

/**
 * Roots that must not be in Node's bundled trust store.
 *
 * emSign ECC Root CA - G3: eight of its intermediates (EM DV/OV/EV TLS CA -
 * G3B/G3C, EM OV CS CA - G3B/G3C) had P-384 private keys in the range 1-255
 * and were revoked as compromised (Oct 2026). NSS 3.131.1 removed the root, and
 * Node picked that up in 22.23.4 / 24.22.1 / 26.12.1. Older Node binaries still
 * trust it, so anyone can forge TLS certs for dogemanga.com / Kavita that our
 * outbound axios calls would accept.
 */
const REVOKED_ROOT_CNS = ['emSign ECC Root CA - G3'];

/** Returns the CNs of revoked roots still present in the given PEM list. */
export function findRevokedRoots(
  pems: readonly string[] = rootCertificates,
): string[] {
  const found: string[] = [];
  for (const pem of pems) {
    const subject = new X509Certificate(pem).subject;
    for (const cn of REVOKED_ROOT_CNS) {
      if (subject.split('\n').includes(`CN=${cn}`)) found.push(cn);
    }
  }
  return found;
}
