/**
 * tokenStaticDataHelper Unit Tests
 */

const { isValidCID, isValidArweaveCID, TokenStaticData } = require('../utils/tokenStaticDataHelper');

describe('tokenStaticDataHelper', () => {
	describe('isValidCID', () => {
		describe('valid CIDs', () => {
			it('should accept valid CIDv0 (Qm prefix, 46 chars total)', () => {
				expect(isValidCID('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')).toBe(true);
			});

			it('should accept valid CIDv1 (b prefix, 59 chars total)', () => {
				expect(isValidCID('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi')).toBe(true);
			});

			it('should accept various valid CIDv0 hashes', () => {
				// Real examples from IPFS
				expect(isValidCID('QmPZ9gcCEpqKTo6aq61g2nXGUhM4iCL3ewB6LDXZCtioEB')).toBe(true);
				expect(isValidCID('QmT5NvUtoM5nWFfrQdVrFtvGfKFmG7AHE8P34isapyhCxX')).toBe(true);
			});
		});

		describe('invalid CIDs', () => {
			it('should reject null', () => {
				expect(isValidCID(null)).toBe(false);
			});

			it('should reject undefined', () => {
				expect(isValidCID(undefined)).toBe(false);
			});

			it('should reject empty string', () => {
				expect(isValidCID('')).toBe(false);
			});

			it('should reject CIDv0 with wrong length', () => {
				// Too short
				expect(isValidCID('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWn')).toBe(false);
				// Too long
				expect(isValidCID('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdGXX')).toBe(false);
			});

			it('should reject CIDv0 with invalid characters', () => {
				// Base58 excludes 0, O, I, l
				expect(isValidCID('Qm0wAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')).toBe(false);
				expect(isValidCID('QmOwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')).toBe(false);
				expect(isValidCID('QmIwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')).toBe(false);
				expect(isValidCID('QmlwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')).toBe(false);
			});

			it('should reject random strings', () => {
				expect(isValidCID('hello world')).toBe(false);
				expect(isValidCID('not-a-cid')).toBe(false);
				expect(isValidCID('https://example.com/image.png')).toBe(false);
			});

			it('should reject Arweave CIDs', () => {
				// Arweave CIDs are 43 chars and may contain - and _
				expect(isValidCID('abc123def456ghi789jkl012mno345pqr678stu90v')).toBe(false);
			});
		});
	});

	describe('isValidArweaveCID', () => {
		describe('valid Arweave CIDs', () => {
			it('should accept valid 43-character Arweave CID', () => {
				// Arweave CIDs are exactly 43 characters
				// 43 chars: abcdefghijklmnopqrstuvwxyz01234567890ABCDEF
				expect(isValidArweaveCID('abcdefghijklmnopqrstuvwxyz01234567890ABCDEF')).toBe(true);
			});

			it('should accept Arweave CID with underscores', () => {
				// 43 chars with underscore
				expect(isValidArweaveCID('abc_efghijklmnopqrstuvwxyz01234567890ABCDEF')).toBe(true);
			});

			it('should accept Arweave CID with hyphens', () => {
				// 43 chars with hyphen
				expect(isValidArweaveCID('abc-efghijklmnopqrstuvwxyz01234567890ABCDEF')).toBe(true);
			});
		});

		describe('invalid Arweave CIDs', () => {
			it('should reject null', () => {
				expect(isValidArweaveCID(null)).toBe(false);
			});

			it('should reject undefined', () => {
				expect(isValidArweaveCID(undefined)).toBe(false);
			});

			it('should reject empty string', () => {
				expect(isValidArweaveCID('')).toBe(false);
			});

			it('should reject wrong length', () => {
				// Too short
				expect(isValidArweaveCID('abc123def456')).toBe(false);
				// Too long (46 chars)
				expect(isValidArweaveCID('abc123def456ghi789jkl012mno345pqr678stu90vwxyz')).toBe(false);
			});

			it('should reject invalid characters', () => {
				expect(isValidArweaveCID('abc!23def456ghi789jkl012mno345pqr678st90')).toBe(false);
				expect(isValidArweaveCID('abc@23def456ghi789jkl012mno345pqr678st90')).toBe(false);
			});

			it('should reject IPFS CIDs', () => {
				expect(isValidArweaveCID('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')).toBe(false);
			});
		});
	});

	describe('TokenStaticData', () => {
		it('should create instance with all properties', () => {
			// TokenStaticData constructor: (uid, address, serial, metadata, rawMetadata, image, attributes, nftName, collection, environment)
			const data = new TokenStaticData(
				'0.0.12345!1',
				'0.0.12345',
				1,
				'ipfs://QmTest',
				'{"name":"Test"}',
				'ipfs://QmImage',
				'[{"trait":"value"}]',
				'Test NFT',
				'TestCollection',
				'mainnet',
			);

			expect(data.uid).toBe('0.0.12345!1');
			expect(data.address).toBe('0.0.12345');
			expect(data.serial).toBe(1);
			expect(data.metadata).toBe('ipfs://QmTest');
			expect(data.rawMetadata).toBe('{"name":"Test"}');
			expect(data.image).toBe('ipfs://QmImage');
			expect(data.attributes).toBe('[{"trait":"value"}]');
			expect(data.nftName).toBe('Test NFT');
			expect(data.collection).toBe('TestCollection');
			expect(data.environment).toBe('mainnet');
		});

		it('should convert to object', () => {
			const data = new TokenStaticData(
				'0.0.12345!1',
				'0.0.12345',
				1,
				'ipfs://QmTest',
				'{"name":"Test"}',
				'ipfs://QmImage',
				'[{"trait":"value"}]',
				'Test NFT',
				'TestCollection',
				'mainnet',
			);

			const obj = data.toObject();

			expect(obj.uid).toBe('0.0.12345!1');
			expect(obj.address).toBe('0.0.12345');
			expect(obj.serial).toBe(1);
			expect(obj.metadata).toBe('ipfs://QmTest');
		});
	});
});
