import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rootCertificates } from 'node:tls';
import { findRevokedRoots } from './trust-store-check';

// Public root cert, SHA-256 86:A1:EC:BA:...:6B:BE:6B (as shipped in Node 24.21.0).
const G3_PEM = readFileSync(
  join(__dirname, '__fixtures__', 'emsign-ecc-root-ca-g3.pem'),
  'utf8',
);

describe('findRevokedRoots', () => {
  it('returns nothing for an empty store', () => {
    expect(findRevokedRoots([])).toEqual([]);
  });

  it('flags emSign ECC Root CA - G3', () => {
    expect(findRevokedRoots([G3_PEM])).toEqual(['emSign ECC Root CA - G3']);
  });

  it('ignores unrelated roots, including the other emSign roots', () => {
    const others = rootCertificates.filter((pem) => pem.trim() !== G3_PEM.trim());
    expect(others.length).toBeGreaterThan(50);
    expect(findRevokedRoots(others)).toEqual([]);
  });

  it('throws on malformed PEM rather than silently passing', () => {
    expect(() => findRevokedRoots(['not a cert'])).toThrow();
  });
});
