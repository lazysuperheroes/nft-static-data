/**
 * checkFileBaseStatus Unit Tests
 */

// Mock axios before requiring the module
jest.mock('axios');
const axios = require('axios');

const {
	getPinStatusSummary,
	getPinsByStatus,
	deletePin,
	checkCIDStatus,
	pinCID,
} = require('../checkFileBaseStatus');

describe('checkFileBaseStatus', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('getPinStatusSummary', () => {
		it('should return summary for all statuses', async () => {
			axios.get.mockImplementation((url) => {
				if (url.includes('status=queued')) {
					return Promise.resolve({ data: { count: 5 } });
				}
				if (url.includes('status=pinning')) {
					return Promise.resolve({ data: { count: 3 } });
				}
				if (url.includes('status=pinned')) {
					return Promise.resolve({ data: { count: 100 } });
				}
				if (url.includes('status=failed')) {
					return Promise.resolve({ data: { count: 2 } });
				}
				return Promise.resolve({ data: { count: 0 } });
			});

			const summary = await getPinStatusSummary();

			expect(summary.queued).toBe(5);
			expect(summary.pinning).toBe(3);
			expect(summary.pinned).toBe(100);
			expect(summary.failed).toBe(2);
		});

		it('should handle API errors gracefully', async () => {
			axios.get.mockRejectedValue(new Error('API Error'));

			const summary = await getPinStatusSummary();

			expect(summary.queued).toContain('Error');
			expect(summary.pinning).toContain('Error');
		});
	});

	describe('getPinsByStatus', () => {
		it('should return pins with specified status', async () => {
			const mockPins = [
				{ requestid: 'req1', pin: { cid: 'Qm1' }, status: 'pinned' },
				{ requestid: 'req2', pin: { cid: 'Qm2' }, status: 'pinned' },
			];

			axios.get.mockResolvedValue({ data: { results: mockPins } });

			const pins = await getPinsByStatus('pinned');

			expect(pins).toHaveLength(2);
			expect(pins[0].requestid).toBe('req1');
			expect(pins[1].pin.cid).toBe('Qm2');
		});

		it('should return empty array on error', async () => {
			axios.get.mockRejectedValue(new Error('API Error'));

			const pins = await getPinsByStatus('failed');

			expect(pins).toEqual([]);
		});
	});

	describe('deletePin', () => {
		it('should successfully delete pin', async () => {
			axios.delete.mockResolvedValue({ status: 200 });

			const result = await deletePin('req123');

			expect(result.success).toBe(true);
			expect(result.status).toBe(200);
		});

		it('should handle delete error', async () => {
			axios.delete.mockRejectedValue(new Error('Delete failed'));

			const result = await deletePin('req123');

			expect(result.success).toBe(false);
			expect(result.error).toBe('Delete failed');
		});
	});

	describe('checkCIDStatus', () => {
		it('should return pin info for existing CID', async () => {
			const mockResult = [
				{ requestid: 'req1', status: 'pinned', created: '2024-01-01' },
			];

			axios.get.mockResolvedValue({ data: { results: mockResult } });

			const results = await checkCIDStatus('QmTestCid');

			expect(results).toHaveLength(1);
			expect(results[0].status).toBe('pinned');
		});

		it('should return empty array for non-existent CID', async () => {
			axios.get.mockResolvedValue({ data: { results: [] } });

			const results = await checkCIDStatus('QmNonExistent');

			expect(results).toEqual([]);
		});

		it('should return error object on API failure', async () => {
			axios.get.mockRejectedValue(new Error('API Error'));

			const results = await checkCIDStatus('QmTestCid');

			expect(results.error).toBe('API Error');
		});
	});

	describe('pinCID', () => {
		it('should successfully pin CID', async () => {
			const mockResponse = { requestid: 'newreq', status: 'queued' };
			axios.post.mockResolvedValue({ data: mockResponse });

			const result = await pinCID('QmNewCid', 'Test Pin');

			expect(result.success).toBe(true);
			expect(result.data.requestid).toBe('newreq');
		});

		it('should use default name when not provided', async () => {
			axios.post.mockResolvedValue({ data: { requestid: 'req' } });

			await pinCID('QmTestCid');

			expect(axios.post).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({ name: 'retry-QmTestCid' }),
				expect.any(Object),
			);
		});

		it('should handle pin error', async () => {
			axios.post.mockRejectedValue({
				response: { data: { error: 'Invalid CID' } },
			});

			const result = await pinCID('InvalidCid');

			expect(result.success).toBe(false);
			expect(result.error).toBe('Invalid CID');
		});

		it('should handle network error', async () => {
			axios.post.mockRejectedValue(new Error('Network error'));

			const result = await pinCID('QmTestCid');

			expect(result.success).toBe(false);
			expect(result.error).toBe('Network error');
		});
	});
});
