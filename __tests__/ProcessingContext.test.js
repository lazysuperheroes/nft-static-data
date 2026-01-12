/**
 * ProcessingContext Unit Tests
 */

const ProcessingContext = require('../utils/ProcessingContext');
const fs = require('fs').promises;
const path = require('path');

describe('ProcessingContext', () => {
	let ctx;

	beforeEach(() => {
		ctx = new ProcessingContext({
			tokenId: '0.0.12345',
			collection: 'TestCollection',
			environment: 'MAIN',
			dryRun: false,
		});
	});

	describe('constructor', () => {
		it('should initialize with provided options', () => {
			expect(ctx.tokenId).toBe('0.0.12345');
			expect(ctx.collection).toBe('TestCollection');
			expect(ctx.environment).toBe('MAIN');
			expect(ctx.dryRun).toBe(false);
		});

		it('should initialize with default values', () => {
			const defaultCtx = new ProcessingContext();
			expect(defaultCtx.tokenId).toBeNull();
			expect(defaultCtx.collection).toBeNull();
			expect(defaultCtx.totalCompleted).toBe(0);
			expect(defaultCtx.totalToProcess).toBe(0);
			expect(defaultCtx.errorSerials).toEqual([]);
		});

		it('should initialize error categories', () => {
			expect(ctx.errors).toEqual({
				fetchMetadata: [],
				pinMetadata: [],
				pinImage: [],
				databaseWrite: [],
				gatewayTimeout: [],
				invalidCID: [],
				other: [],
			});
		});

		it('should use custom schema from options', () => {
			const customCtx = new ProcessingContext({ schema: 'SecureTradeMetadata' });
			expect(customCtx.schemaName).toBe('SecureTradeMetadata');
		});
	});

	describe('start()', () => {
		it('should initialize start time and reset counters', () => {
			ctx.totalCompleted = 10;
			ctx.errorSerials = ['test'];
			ctx.errors.fetchMetadata = [{ test: true }];

			ctx.start();

			expect(ctx.startTime).toBeDefined();
			expect(ctx.totalCompleted).toBe(0);
			expect(ctx.totalToProcess).toBe(0);
			expect(ctx.errorSerials).toEqual([]);
			expect(ctx.errors.fetchMetadata).toEqual([]);
		});
	});

	describe('complete()', () => {
		it('should set end time', () => {
			ctx.start();
			ctx.complete();

			expect(ctx.endTime).toBeDefined();
			expect(ctx.endTime).toBeGreaterThanOrEqual(ctx.startTime);
		});
	});

	describe('progress tracking', () => {
		it('should increment completed count', () => {
			ctx.incrementCompleted();
			expect(ctx.totalCompleted).toBe(1);

			ctx.incrementCompleted();
			expect(ctx.totalCompleted).toBe(2);
		});

		it('should add to process count', () => {
			ctx.addToProcess(10);
			expect(ctx.totalToProcess).toBe(10);

			ctx.addToProcess(5);
			expect(ctx.totalToProcess).toBe(15);
		});

		it('should set actual total correctly', () => {
			ctx.totalToProcess = 50;
			ctx.setActualTotal(100);
			expect(ctx.actualTotal).toBe(100);

			// Should use max of provided value and totalToProcess
			ctx.setActualTotal(30);
			expect(ctx.actualTotal).toBe(50);
		});

		it('should call progress callback when reporting', () => {
			const mockCallback = jest.fn();
			ctx.progressCallback = mockCallback;
			ctx.actualTotal = 100;
			ctx.totalCompleted = 50;
			ctx.errorSerials = ['err1'];

			ctx.reportProgress();

			expect(mockCallback).toHaveBeenCalledWith(50, 100, 1);
		});

		it('should check completion status', () => {
			ctx.totalToProcess = 10;
			ctx.totalCompleted = 5;
			expect(ctx.isComplete()).toBe(false);

			ctx.totalCompleted = 10;
			expect(ctx.isComplete()).toBe(true);
		});
	});

	describe('error tracking - legacy', () => {
		it('should record error serial (legacy format)', () => {
			ctx.recordErrorSerial('0.0.12345', 42);
			expect(ctx.errorSerials).toContain('0.0.1234542');
		});

		it('should record error with details', () => {
			const error = new Error('Test error');
			ctx.recordError(42, error);

			expect(ctx.errorSerials).toHaveLength(1);
			expect(ctx.errorSerials[0]).toMatchObject({
				serial: 42,
				error: 'Test error',
			});
			expect(ctx.errorSerials[0].timestamp).toBeDefined();
		});
	});

	describe('categorized error tracking', () => {
		it('should record categorized error with full details', () => {
			ctx.recordCategorizedError('fetchMetadata', {
				serial: 42,
				cid: 'QmTest123',
				gateway: 'https://ipfs.io',
				message: 'Failed to fetch',
				retryCount: 3,
			});

			expect(ctx.errors.fetchMetadata).toHaveLength(1);
			expect(ctx.errors.fetchMetadata[0]).toMatchObject({
				tokenId: '0.0.12345',
				serial: 42,
				cid: 'QmTest123',
				gateway: 'https://ipfs.io',
				message: 'Failed to fetch',
				retryCount: 3,
			});
			expect(ctx.errors.fetchMetadata[0].timestamp).toBeDefined();
		});

		it('should add to legacy errorSerials for backward compatibility', () => {
			ctx.recordCategorizedError('pinMetadata', {
				serial: 99,
				cid: 'QmTest456',
			});

			expect(ctx.errorSerials).toContain('0.0.1234599');
		});

		it('should handle unknown categories', () => {
			ctx.recordCategorizedError('unknownCategory', {
				serial: 1,
				message: 'Unknown error',
			});

			expect(ctx.errors.other).toHaveLength(1);
			expect(ctx.errors.other[0].category).toBe('unknownCategory');
		});

		it('should extract error message from Error object', () => {
			const error = new Error('Detailed error message');
			ctx.recordCategorizedError('pinImage', {
				serial: 5,
				error,
			});

			expect(ctx.errors.pinImage[0].message).toBe('Detailed error message');
			expect(ctx.errors.pinImage[0].stack).toBeDefined();
		});

		it('should get total error count across categories', () => {
			ctx.recordCategorizedError('fetchMetadata', { serial: 1 });
			ctx.recordCategorizedError('pinMetadata', { serial: 2 });
			ctx.recordCategorizedError('pinImage', { serial: 3 });

			expect(ctx.getTotalErrorCount()).toBe(3);
		});

		it('should generate error summary', () => {
			ctx.recordCategorizedError('fetchMetadata', { serial: 1, cid: 'Qm1', message: 'Error 1' });
			ctx.recordCategorizedError('fetchMetadata', { serial: 2, cid: 'Qm2', message: 'Error 2' });
			ctx.recordCategorizedError('pinMetadata', { serial: 3, cid: 'Qm3', message: 'Error 3' });

			const summary = ctx.getErrorSummary();

			expect(summary.fetchMetadata).toBeDefined();
			expect(summary.fetchMetadata.count).toBe(2);
			expect(summary.fetchMetadata.samples).toHaveLength(2);
			expect(summary.pinMetadata.count).toBe(1);
		});

		it('should get all errors as flat list sorted by timestamp', async () => {
			ctx.recordCategorizedError('fetchMetadata', { serial: 1 });
			await new Promise(r => setTimeout(r, 10));
			ctx.recordCategorizedError('pinMetadata', { serial: 2 });
			await new Promise(r => setTimeout(r, 10));
			ctx.recordCategorizedError('pinImage', { serial: 3 });

			const allErrors = ctx.getAllErrors();

			expect(allErrors).toHaveLength(3);
			expect(allErrors[0].category).toBe('fetchMetadata');
			expect(allErrors[1].category).toBe('pinMetadata');
			expect(allErrors[2].category).toBe('pinImage');
			// Should be sorted by timestamp
			expect(allErrors[0].timestamp).toBeLessThan(allErrors[1].timestamp);
			expect(allErrors[1].timestamp).toBeLessThan(allErrors[2].timestamp);
		});
	});

	describe('error export', () => {
		const testDir = path.join(__dirname, 'temp');

		beforeAll(async () => {
			await fs.mkdir(testDir, { recursive: true });
		});

		afterAll(async () => {
			// Cleanup test files
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

		it('should export errors to JSON file', async () => {
			ctx.recordCategorizedError('fetchMetadata', { serial: 1, cid: 'Qm1' });
			ctx.recordCategorizedError('pinMetadata', { serial: 2, cid: 'Qm2' });

			const exportPath = path.join(testDir, 'test-errors.json');
			const result = await ctx.exportErrors(exportPath);

			expect(result).toBe(exportPath);

			const content = JSON.parse(await fs.readFile(exportPath, 'utf8'));
			expect(content.tokenId).toBe('0.0.12345');
			expect(content.collection).toBe('TestCollection');
			expect(content.totalErrors).toBe(2);
			expect(content.errors).toHaveLength(2);
			expect(content.summary.fetchMetadata.count).toBe(1);
		});
	});

	describe('environment mapping', () => {
		it('should map environment names correctly', () => {
			expect(ctx.getMappedEnv('MAIN')).toBe('mainnet');
			expect(ctx.getMappedEnv('TEST')).toBe('testnet');
			expect(ctx.getMappedEnv('PREVIEW')).toBe('previewnet');
			expect(ctx.getMappedEnv('CUSTOM')).toBe('custom');
		});
	});

	describe('schema support', () => {
		it('should detect normalized mode for non-TokenStaticData schemas', () => {
			const tokenCtx = new ProcessingContext({ schema: 'TokenStaticData' });
			expect(tokenCtx.isNormalizedMode()).toBe(false);

			const secureCtx = new ProcessingContext({ schema: 'SecureTradeMetadata' });
			expect(secureCtx.isNormalizedMode()).toBe(true);
		});
	});

	describe('serialization', () => {
		it('should serialize to JSON', () => {
			ctx.start();
			ctx.totalCompleted = 50;
			ctx.totalToProcess = 100;
			ctx.actualTotal = 100;
			ctx.recordCategorizedError('fetchMetadata', { serial: 1 });

			const json = ctx.toJSON();

			expect(json.tokenId).toBe('0.0.12345');
			expect(json.collection).toBe('TestCollection');
			expect(json.totalCompleted).toBe(50);
			expect(json.errors.fetchMetadata).toHaveLength(1);
			expect(json.schemaName).toBe('TokenStaticData');
		});

		it('should restore from JSON', () => {
			const json = {
				tokenId: '0.0.99999',
				collection: 'RestoredCollection',
				environment: 'TEST',
				totalCompleted: 25,
				totalToProcess: 50,
				actualTotal: 50,
				errorSerials: ['err1', 'err2'],
				errors: {
					fetchMetadata: [{ serial: 1, message: 'test' }],
					pinMetadata: [],
					pinImage: [],
					databaseWrite: [],
					gatewayTimeout: [],
					invalidCID: [],
					other: [],
				},
				dryRun: true,
				startTime: Date.now() - 10000,
				schemaName: 'SecureTradeMetadata',
			};

			const restored = ProcessingContext.fromJSON(json);

			expect(restored.tokenId).toBe('0.0.99999');
			expect(restored.collection).toBe('RestoredCollection');
			expect(restored.totalCompleted).toBe(25);
			expect(restored.errorSerials).toHaveLength(2);
			expect(restored.errors.fetchMetadata).toHaveLength(1);
			expect(restored.schemaName).toBe('SecureTradeMetadata');
			expect(restored.dryRun).toBe(true);
		});
	});

	describe('getSummary()', () => {
		it('should return comprehensive summary', () => {
			ctx.start();
			ctx.totalCompleted = 90;
			ctx.actualTotal = 100;
			ctx.recordCategorizedError('fetchMetadata', { serial: 1 });
			ctx.recordCategorizedError('pinMetadata', { serial: 2 });
			ctx.complete();

			const summary = ctx.getSummary();

			expect(summary.tokenId).toBe('0.0.12345');
			expect(summary.collection).toBe('TestCollection');
			expect(summary.completed).toBe(90);
			expect(summary.total).toBe(100);
			// Legacy count from errorSerials
			expect(summary.errors).toBe(2);
			expect(summary.totalCategorizedErrors).toBe(2);
			expect(summary.errorsByCategory.fetchMetadata.count).toBe(1);
			expect(summary.durationMs).toBeGreaterThanOrEqual(0);
		});
	});
});
