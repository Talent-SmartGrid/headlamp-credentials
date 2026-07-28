import {describe, expect, it} from 'vitest';

import {buildDidWebDocument, didWeb, didWebDocumentUrl} from '../src/index.js';
import {fixtureKeys, issuerDidDocument} from './helpers.js';

describe('did:web issuer identity', () => {
  it('maps domain to DID and DID to the well-known URL', () => {
    expect(didWeb('myheadlamp.com')).toBe('did:web:myheadlamp.com');
    expect(didWebDocumentUrl('did:web:myheadlamp.com'))
      .toBe('https://myheadlamp.com/.well-known/did.json');
    expect(didWebDocumentUrl('did:web:example.com:issuers:main'))
      .toBe('https://example.com/issuers/main/did.json');
  });

  it('emits a DID document with multiple verification methods (rotation-ready)', () => {
    const doc = issuerDidDocument();
    expect(doc.id).toBe('did:web:myheadlamp.com');
    expect(doc.verificationMethod).toHaveLength(2);
    expect(doc.verificationMethod.map(vm => vm.id)).toEqual([
      'did:web:myheadlamp.com#key-1',
      'did:web:myheadlamp.com#key-2',
    ]);
    for (const vm of doc.verificationMethod) {
      expect(vm.type).toBe('Multikey');
      expect(vm.controller).toBe('did:web:myheadlamp.com');
      expect(vm.publicKeyMultibase).toMatch(/^z/);
    }
    expect(doc.assertionMethod).toEqual(doc.verificationMethod.map(vm => vm.id));
  });

  it('rejects duplicate or malformed key fragments and empty key lists', () => {
    const key = {fragment: 'key-1', publicKeyMultibase: fixtureKeys.issuerKey1.publicKeyMultibase};
    expect(() => buildDidWebDocument({domain: 'x.com', publicKeys: []})).toThrow();
    expect(() => buildDidWebDocument({domain: 'x.com', publicKeys: [key, key]})).toThrow();
    expect(() => buildDidWebDocument({
      domain: 'x.com',
      publicKeys: [{...key, fragment: 'bad fragment!'}],
    })).toThrow();
  });

  it('contains no secret material', () => {
    const json = JSON.stringify(issuerDidDocument());
    expect(json).not.toContain('secret');
    expect(json).not.toContain(fixtureKeys.issuerKey1.secretKeyMultibase);
    expect(json).not.toContain(fixtureKeys.issuerKey2.secretKeyMultibase);
  });
});
