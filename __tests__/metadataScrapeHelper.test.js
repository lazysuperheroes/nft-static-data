/**
 * metadataScrapeHelper Unit Tests
 */

const { extractCIDFromUrl } = require('../utils/metadataScrapeHelper');

describe('metadataScrapeHelper', () => {
	describe('extractCIDFromUrl', () => {
		describe('null/undefined handling', () => {
			it('should return null for null input', () => {
				expect(extractCIDFromUrl(null)).toBeNull();
			});

			it('should return null for undefined input', () => {
				expect(extractCIDFromUrl(undefined)).toBeNull();
			});

			it('should return null for empty string', () => {
				expect(extractCIDFromUrl('')).toBeNull();
			});
		});

		describe('IPFS protocol URLs (ipfs://)', () => {
			it('should extract CID from lowercase ipfs:// URL', () => {
				const cid = extractCIDFromUrl('ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
				expect(cid).toBe('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
			});

			it('should extract CID from uppercase IPFS:// URL', () => {
				const cid = extractCIDFromUrl('IPFS://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
				expect(cid).toBe('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
			});

			it('should extract CID from mixed case IpFs:// URL', () => {
				const cid = extractCIDFromUrl('IpFs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
				expect(cid).toBe('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
			});

			it('should extract CID from ipfs:// URL with path', () => {
				const cid = extractCIDFromUrl('ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG/metadata.json');
				expect(cid).toBe('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
			});

			it('should extract CIDv1 (base32) format', () => {
				const cid = extractCIDFromUrl('ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi');
				expect(cid).toBe('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi');
			});
		});

		describe('IPFS gateway URLs (/ipfs/ path)', () => {
			it('should extract CID from ipfs.io gateway', () => {
				const cid = extractCIDFromUrl('https://ipfs.io/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
				expect(cid).toBe('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
			});

			it('should extract CID from cloudflare-ipfs.com gateway', () => {
				const cid = extractCIDFromUrl('https://cloudflare-ipfs.com/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
				expect(cid).toBe('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
			});

			it('should extract CID from ipfs.infura.io gateway', () => {
				const cid = extractCIDFromUrl('https://ipfs.infura.io/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
				expect(cid).toBe('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
			});

			it('should extract CID from gateway.pinata.cloud gateway', () => {
				const cid = extractCIDFromUrl('https://gateway.pinata.cloud/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
				expect(cid).toBe('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
			});

			it('should extract CID from any gateway with /ipfs/ path', () => {
				const cid = extractCIDFromUrl('https://my-custom-gateway.example.com/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
				expect(cid).toBe('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
			});

			it('should extract CID from gateway URL with additional path', () => {
				const cid = extractCIDFromUrl('https://ipfs.io/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG/images/1.png');
				expect(cid).toBe('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
			});

			it('should extract CID from gateway URL with query params', () => {
				const cid = extractCIDFromUrl('https://ipfs.io/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG?filename=test.json');
				expect(cid).toBe('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
			});
		});

		describe('IPFS subdomain-style URLs', () => {
			it('should extract CID from dweb.link subdomain style', () => {
				const cid = extractCIDFromUrl('https://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG.ipfs.dweb.link/');
				expect(cid).toBe('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
			});

			it('should extract CID from cf-ipfs.com subdomain style', () => {
				const cid = extractCIDFromUrl('https://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi.ipfs.cf-ipfs.com/');
				expect(cid).toBe('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi');
			});
		});

		describe('Arweave protocol URLs (ar://)', () => {
			it('should extract CID from lowercase ar:// URL', () => {
				const cid = extractCIDFromUrl('ar://abc123def456ghi789jkl012mno345pqr678st90v');
				expect(cid).toBe('abc123def456ghi789jkl012mno345pqr678st90v');
			});

			it('should extract CID from uppercase AR:// URL', () => {
				const cid = extractCIDFromUrl('AR://abc123def456ghi789jkl012mno345pqr678st90v');
				expect(cid).toBe('abc123def456ghi789jkl012mno345pqr678st90v');
			});

			it('should extract CID from ar:// URL with path', () => {
				const cid = extractCIDFromUrl('ar://abc123def456ghi789jkl012mno345pqr678st90v/metadata.json');
				expect(cid).toBe('abc123def456ghi789jkl012mno345pqr678st90v');
			});
		});

		describe('Arweave gateway URLs', () => {
			it('should extract CID from arweave.net gateway', () => {
				const cid = extractCIDFromUrl('https://arweave.net/abc123def456');
				expect(cid).toBe('abc123def456');
			});

			it('should extract CID from ar-io.dev gateway', () => {
				const cid = extractCIDFromUrl('https://ar-io.dev/abc123def456');
				expect(cid).toBe('abc123def456');
			});

			it('should extract CID from permagate.io gateway', () => {
				const cid = extractCIDFromUrl('https://permagate.io/abc123def456');
				expect(cid).toBe('abc123def456');
			});

			it('should extract CID from arweave.developerdao.com gateway', () => {
				const cid = extractCIDFromUrl('https://arweave.developerdao.com/abc123def456');
				expect(cid).toBe('abc123def456');
			});

			it('should extract CID from arweave gateway with path', () => {
				const cid = extractCIDFromUrl('https://arweave.net/abc123def456/image.png');
				expect(cid).toBe('abc123def456');
			});
		});

		describe('HCS (Hedera Consensus Service) URLs', () => {
			it('should extract topic ID from hcs:// URL', () => {
				const cid = extractCIDFromUrl('hcs://1/0.0.12345');
				expect(cid).toBe('0.0.12345');
			});
		});

		describe('bare CID detection', () => {
			it('should detect bare CIDv0', () => {
				const cid = extractCIDFromUrl('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
				expect(cid).toBe('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
			});

			it('should detect bare CIDv1', () => {
				const cid = extractCIDFromUrl('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi');
				expect(cid).toBe('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi');
			});

			it('should detect bare CID with path', () => {
				const cid = extractCIDFromUrl('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG/metadata.json');
				expect(cid).toBe('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
			});
		});

		describe('non-IPFS/Arweave URLs', () => {
			it('should return null for regular HTTP URLs', () => {
				const cid = extractCIDFromUrl('https://example.com/image.png');
				expect(cid).toBeNull();
			});

			it('should return null for S3 URLs', () => {
				const cid = extractCIDFromUrl('https://my-bucket.s3.amazonaws.com/images/nft.png');
				expect(cid).toBeNull();
			});

			it('should return null for data URLs', () => {
				const cid = extractCIDFromUrl('data:image/png;base64,iVBORw0KGgo=');
				expect(cid).toBeNull();
			});

			it('should return null for random strings', () => {
				const cid = extractCIDFromUrl('not-a-valid-cid-at-all');
				expect(cid).toBeNull();
			});
		});

		describe('edge cases', () => {
			it('should handle URLs with HTTP (not HTTPS)', () => {
				const cid = extractCIDFromUrl('http://ipfs.io/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
				expect(cid).toBe('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
			});

			it('should handle URLs with port numbers', () => {
				const cid = extractCIDFromUrl('http://localhost:8080/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
				expect(cid).toBe('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
			});

			it('should handle filebase gateway URL', () => {
				const cid = extractCIDFromUrl('https://lazysuperheroes.myfilebase.com/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
				expect(cid).toBe('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
			});
		});
	});
});
