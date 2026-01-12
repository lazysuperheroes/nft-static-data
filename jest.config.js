module.exports = {
	testEnvironment: 'node',
	testMatch: ['**/__tests__/**/*.test.js'],
	collectCoverageFrom: [
		'utils/**/*.js',
		'analyzeErrors.js',
		'checkFileBaseStatus.js',
		'!**/node_modules/**',
	],
	coverageThreshold: {
		global: {
			branches: 5,
			functions: 5,
			lines: 10,
			statements: 10,
		},
		// Enforce higher coverage for well-tested modules
		'./utils/ProcessingContext.js': {
			branches: 70,
			functions: 90,
			lines: 90,
			statements: 90,
		},
	},
	// Mock environment variables for tests
	setupFiles: ['<rootDir>/__tests__/setup.js'],
	// Timeout for async tests
	testTimeout: 10000,
};
