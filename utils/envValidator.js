/**
 * Environment Variable Validator
 * Validates required environment variables on startup
 *
 * Supports multiple credential sources:
 * 1. Environment variables (from .env or shell)
 * 2. OS Keychain (if keytar installed)
 */

const { maskCredential, REQUIRED_CREDENTIALS, loadCredentialsFromKeychain, isKeychainAvailable } = require('./credentialManager');

let keychainLoaded = false;

/**
 * Validate environment variables with optional masked display
 *
 * @param {Object} options - Validation options
 * @param {boolean} options.showMasked - Display masked credential values (default: false)
 * @param {boolean} options.exitOnMissing - Exit process if missing (default: true)
 * @param {boolean} options.useKeychain - Load from keychain if available (default: true)
 * @returns {boolean|Promise<boolean>} True if all required variables are present
 */
async function validateEnvironment(options = {}) {
	const { showMasked = false, exitOnMissing = true, useKeychain = true } = options;

	// Load credentials from keychain if available and not already loaded
	if (useKeychain && !keychainLoaded && isKeychainAvailable()) {
		const loaded = await loadCredentialsFromKeychain();
		keychainLoaded = true;
		if (loaded > 0) {
			console.log(`Loaded ${loaded} credential(s) from OS keychain`);
		}
	}

	const required = Object.keys(REQUIRED_CREDENTIALS);
	const missing = required.filter(key => !process.env[key]);

	if (missing.length > 0) {
		console.error('Missing required environment variables:');
		missing.forEach(key => {
			const config = REQUIRED_CREDENTIALS[key];
			console.error(`   - ${key}: ${config.description}`);
		});
		console.error('\nPlease create a .env file with the following variables:');
		console.error('   DIRECTUS_DB_URL=https://your-directus-instance.com');
		console.error('   DIRECTUS_TOKEN=your-static-token-here');
		console.error('   FILEBASE_PINNING_SERVICE=https://api.filebase.io/v1/ipfs/pins');
		console.error('   FILEBASE_PINNING_API_KEY=your-filebase-api-key-here');
		console.error('\nSee README.md for more information.');

		if (exitOnMissing) {
			process.exit(1);
		}
		return false;
	}

	if (showMasked) {
		console.log('\nCredentials loaded:');
		for (const [name, config] of Object.entries(REQUIRED_CREDENTIALS)) {
			const masked = maskCredential(process.env[name]);
			console.log(`   ${config.description}: ${masked}`);
		}
		console.log('');
	}

	console.log('Environment variables validated');
	return true;
}

/**
 * Display all credential values in masked format
 * Safe for logging and display
 */
function displayMaskedCredentials() {
	console.log('\n=== Loaded Credentials ===\n');

	for (const [name, config] of Object.entries(REQUIRED_CREDENTIALS)) {
		const value = process.env[name];
		const masked = maskCredential(value);
		const status = value ? '+' : '-';

		console.log(`[${status}] ${config.description}`);
		console.log(`    ${name}: ${masked}`);
	}

	console.log('\n==========================\n');
}

module.exports = { validateEnvironment, displayMaskedCredentials };
