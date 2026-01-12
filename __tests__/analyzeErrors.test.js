/**
 * analyzeErrors Unit Tests
 */

const fs = require('fs').promises;
const path = require('path');
const {
	analyzeErrorFile,
	generateRecommendations,
	findLatestErrorFile,
} = require('../analyzeErrors');

describe('analyzeErrors', () => {
	const testDir = path.join(__dirname, 'temp-analyze');

	beforeAll(async () => {
		await fs.mkdir(testDir, { recursive: true });
	});

	afterAll(async () => {
		try {
			const files = await fs.readdir(testDir);
			for (const file of files) {
				await fs.unlink(path.join(testDir, file));
			}
			await fs.rmdir(testDir);
		}
		catch (e) {
			// Ignore cleanup errors
		}
	});

	describe('analyzeErrorFile', () => {
		it('should return null for non-existent file', async () => {
			const result = await analyzeErrorFile('/nonexistent/path/errors.json');
			expect(result).toBeNull();
		});

		it('should parse valid error export file', async () => {
			const errorData = {
				tokenId: '0.0.12345',
				collection: 'TestCollection',
				exportTime: new Date().toISOString(),
				totalErrors: 3,
				summary: {
					fetchMetadata: { count: 2, samples: [{ serial: 1, cid: 'Qm1', message: 'Error 1' }] },
					pinMetadata: { count: 1, samples: [{ serial: 2, cid: 'Qm2', message: 'Error 2' }] },
				},
				errors: [
					{ category: 'fetchMetadata', serial: 1, cid: 'QmCid1' },
					{ category: 'fetchMetadata', serial: 2, cid: 'QmCid2' },
					{ category: 'pinMetadata', serial: 3, cid: 'QmCid3' },
				],
			};

			const filePath = path.join(testDir, 'test-errors.json');
			await fs.writeFile(filePath, JSON.stringify(errorData));

			const result = await analyzeErrorFile(filePath);

			expect(result).toBeDefined();
			expect(result.data.tokenId).toBe('0.0.12345');
			expect(result.data.totalErrors).toBe(3);
			expect(result.failedCIDs).toHaveLength(3);
			expect(result.failedCIDs).toContain('QmCid1');
			expect(result.failedCIDs).toContain('QmCid2');
			expect(result.failedCIDs).toContain('QmCid3');
		});

		it('should extract unique CIDs', async () => {
			const errorData = {
				tokenId: '0.0.12345',
				exportTime: new Date().toISOString(),
				totalErrors: 3,
				summary: {},
				errors: [
					{ category: 'fetchMetadata', serial: 1, cid: 'QmDuplicate' },
					{ category: 'fetchMetadata', serial: 2, cid: 'QmDuplicate' },
					{ category: 'pinMetadata', serial: 3, cid: 'QmUnique' },
				],
			};

			const filePath = path.join(testDir, 'test-duplicate-cids.json');
			await fs.writeFile(filePath, JSON.stringify(errorData));

			const result = await analyzeErrorFile(filePath);

			expect(result.failedCIDs).toHaveLength(2);
			expect(result.failedCIDs).toContain('QmDuplicate');
			expect(result.failedCIDs).toContain('QmUnique');
		});
	});

	describe('generateRecommendations', () => {
		it('should return empty array when no issues', () => {
			const recommendations = generateRecommendations(null, null, null);
			expect(recommendations).toEqual([]);
		});

		it('should recommend for high fetch failures', () => {
			const errorData = {
				summary: {
					fetchMetadata: { count: 15 },
				},
			};

			const recommendations = generateRecommendations(errorData, null, null);

			expect(recommendations.length).toBeGreaterThan(0);
			expect(recommendations.some(r => r.issue.includes('fetch'))).toBe(true);
		});

		it('should recommend for pin failures', () => {
			const errorData = {
				summary: {
					pinMetadata: { count: 3 },
					pinImage: { count: 5 },
				},
			};

			const recommendations = generateRecommendations(errorData, null, null);

			expect(recommendations.length).toBeGreaterThan(0);
			expect(recommendations.some(r => r.issue.includes('pin'))).toBe(true);
		});

		it('should recommend for Filebase failed pins', () => {
			const filebaseStatus = {
				failed: [{ cid: 'Qm1' }, { cid: 'Qm2' }],
			};

			const recommendations = generateRecommendations(null, null, filebaseStatus);

			expect(recommendations.length).toBeGreaterThan(0);
			expect(recommendations.some(r => r.issue.includes('failed state'))).toBe(true);
		});

		it('should recommend for stuck pins', () => {
			const filebaseStatus = {
				queued: new Array(60).fill({ cid: 'Qm' }),
				pinning: [],
				failed: [],
			};

			const recommendations = generateRecommendations(null, null, filebaseStatus);

			expect(recommendations.length).toBeGreaterThan(0);
			expect(recommendations.some(r => r.issue.includes('stuck'))).toBe(true);
		});

		it('should recommend for timeout patterns in logs', () => {
			const logStats = {
				byMessage: {
					'timeout error occurred': 100,
				},
			};

			const recommendations = generateRecommendations(null, logStats, null);

			expect(recommendations.length).toBeGreaterThan(0);
			expect(recommendations.some(r => r.issue.includes('timeout'))).toBe(true);
		});
	});

	describe('findLatestErrorFile', () => {
		it('should return null for non-existent directory', () => {
			// Save original config
			const config = require('../config');
			const originalDir = config.cache.progressStateDir;

			// Set to non-existent directory
			config.cache.progressStateDir = '/nonexistent/directory';

			const result = findLatestErrorFile();
			expect(result).toBeNull();

			// Restore config
			config.cache.progressStateDir = originalDir;
		});
	});
});
