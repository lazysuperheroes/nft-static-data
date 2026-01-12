/**
 * Jest Test Setup
 * Sets up mock environment variables and global test utilities
 */

// Mock environment variables for tests
process.env.DIRECTUS_URL = 'https://test-directus.example.com';
process.env.DIRECTUS_TOKEN = 'test-token-12345';
process.env.FILEBASE_PINNING_SERVICE = 'https://api.filebase.io/v1/ipfs/pins';
process.env.FILEBASE_PINNING_API_KEY = 'test-filebase-key';
process.env.DB_SCHEMA = 'TokenStaticData';

// Suppress console output during tests unless debugging
if (!process.env.DEBUG_TESTS) {
	global.console = {
		...console,
		log: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		// Keep error for debugging
		error: console.error,
	};
}
