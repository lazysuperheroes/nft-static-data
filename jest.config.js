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
			branches: 50,
			functions: 50,
			lines: 50,
			statements: 50,
		},
	},
	// Mock environment variables for tests
	setupFiles: ['<rootDir>/__tests__/setup.js'],
	// Timeout for async tests
	testTimeout: 10000,
};
