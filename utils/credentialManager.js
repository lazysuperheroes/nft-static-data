/**
 * Credential Manager - Secure credential handling with masked display
 *
 * Features:
 * - Masked display (shows first 2 and last 2 characters)
 * - Validation of required credentials
 * - Environment variable loading with fallback prompts
 * - Optional OS keychain integration (requires keytar)
 */

const readlineSync = require('readline-sync');
const logger = require('./logger');
require('dotenv').config();

// Service name for keychain storage
const KEYCHAIN_SERVICE = 'nft-static-data';

// Lazy-load keytar (optional dependency)
let keytar = null;
function getKeytar() {
	if (keytar === null) {
		try {
			keytar = require('keytar');
		}
		catch {
			keytar = false; // Mark as unavailable
		}
	}
	return keytar || null;
}

/**
 * Required credentials for the application
 */
const REQUIRED_CREDENTIALS = {
	DIRECTUS_DB_URL: {
		description: 'Directus Database URL',
		sensitive: false,
	},
	DIRECTUS_TOKEN: {
		description: 'Directus API Token',
		sensitive: true,
	},
	FILEBASE_PINNING_SERVICE: {
		description: 'Filebase Pinning Service URL',
		sensitive: false,
	},
	FILEBASE_PINNING_API_KEY: {
		description: 'Filebase API Key',
		sensitive: true,
	},
};

/**
 * Mask a credential string for display
 * Shows first 2 and last 2 characters with asterisks in between
 *
 * @param {string} value - The credential value to mask
 * @param {number} visibleStart - Number of characters to show at start (default: 2)
 * @param {number} visibleEnd - Number of characters to show at end (default: 2)
 * @returns {string} Masked string
 */
function maskCredential(value, visibleStart = 2, visibleEnd = 2) {
	if (!value || typeof value !== 'string') {
		return '(not set)';
	}

	const minLength = visibleStart + visibleEnd + 3; // At least 3 asterisks

	if (value.length < minLength) {
		// For very short values, just show asterisks
		return '*'.repeat(Math.max(value.length, 4));
	}

	const start = value.substring(0, visibleStart);
	const end = value.substring(value.length - visibleEnd);
	const masked = '*'.repeat(Math.min(value.length - visibleStart - visibleEnd, 8));

	return `${start}${masked}${end}`;
}

/**
 * Get a credential from environment or prompt user
 *
 * @param {string} name - Environment variable name
 * @param {string} description - Human-readable description
 * @param {boolean} sensitive - Whether to hide input
 * @returns {string|null} Credential value or null if not provided
 */
function getCredential(name, description, sensitive = true) {
	// First try environment variable
	const envValue = process.env[name];
	if (envValue) {
		return envValue;
	}

	// Prompt user if not in environment
	console.log(`\n${description} not found in environment.`);

	if (sensitive) {
		return readlineSync.question(`Enter ${description}: `, {
			hideEchoBack: true,
			mask: '*',
		});
	}
	else {
		return readlineSync.question(`Enter ${description}: `);
	}
}

/**
 * Validate all required credentials are present
 *
 * @param {boolean} interactive - Whether to prompt for missing credentials
 * @returns {Object} Validation result with { valid: boolean, missing: string[], credentials: Object }
 */
function validateCredentials(interactive = false) {
	const missing = [];
	const credentials = {};

	for (const [name, config] of Object.entries(REQUIRED_CREDENTIALS)) {
		let value = process.env[name];

		if (!value && interactive) {
			value = getCredential(name, config.description, config.sensitive);
			if (value) {
				// Set in process.env for subsequent use
				process.env[name] = value;
			}
		}

		if (!value) {
			missing.push(name);
		}

		credentials[name] = {
			value,
			masked: maskCredential(value),
			description: config.description,
			present: !!value,
		};
	}

	return {
		valid: missing.length === 0,
		missing,
		credentials,
	};
}

/**
 * Display credential status with masked values
 *
 * @param {boolean} showAll - Show all credentials including non-sensitive ones
 */
function displayCredentialStatus(showAll = false) {
	console.log('\n=== Credential Status ===\n');

	for (const [name, config] of Object.entries(REQUIRED_CREDENTIALS)) {
		const value = process.env[name];
		const masked = maskCredential(value);
		const status = value ? 'SET' : 'MISSING';
		const statusSymbol = value ? '+' : '-';

		if (showAll || config.sensitive) {
			console.log(`[${statusSymbol}] ${config.description}`);
			console.log(`    ${name}: ${masked}`);
		}
	}

	console.log('\n=========================\n');
}

/**
 * Ensure all credentials are available, prompting if necessary
 *
 * @param {Object} options - Options
 * @param {boolean} options.interactive - Allow interactive prompts
 * @param {boolean} options.exitOnMissing - Exit process if credentials missing
 * @returns {boolean} True if all credentials are valid
 */
function ensureCredentials(options = {}) {
	const { interactive = true, exitOnMissing = true } = options;

	const result = validateCredentials(interactive);

	if (!result.valid) {
		console.error('\nMissing required credentials:');
		for (const name of result.missing) {
			const config = REQUIRED_CREDENTIALS[name];
			console.error(`  - ${name}: ${config.description}`);
		}
		console.error('\nPlease set these in your .env file or provide them when prompted.\n');

		logger.error('Missing credentials', { missing: result.missing });

		if (exitOnMissing) {
			process.exit(1);
		}

		return false;
	}

	logger.info('Credentials validated', {
		count: Object.keys(REQUIRED_CREDENTIALS).length,
	});

	return true;
}

/**
 * Get masked summary of all credentials for logging
 * Safe to include in logs as values are masked
 *
 * @returns {Object} Object with credential names mapped to masked values
 */
function getMaskedCredentialSummary() {
	const summary = {};

	for (const name of Object.keys(REQUIRED_CREDENTIALS)) {
		summary[name] = maskCredential(process.env[name]);
	}

	return summary;
}

/**
 * CredentialManager class for more advanced use cases
 */
class CredentialManager {
	constructor() {
		this.credentials = {};
		this.validated = false;
	}

	/**
	 * Load and validate credentials
	 */
	load(interactive = false) {
		const result = validateCredentials(interactive);
		this.credentials = result.credentials;
		this.validated = result.valid;
		return result;
	}

	/**
	 * Get a specific credential value
	 */
	get(name) {
		return process.env[name];
	}

	/**
	 * Get a specific credential masked
	 */
	getMasked(name) {
		return maskCredential(process.env[name]);
	}

	/**
	 * Check if a credential is present
	 */
	has(name) {
		return !!process.env[name];
	}

	/**
	 * Display status
	 */
	displayStatus() {
		displayCredentialStatus(true);
	}
}

/**
 * Check if keychain storage is available
 */
function isKeychainAvailable() {
	return getKeytar() !== null;
}

/**
 * Store a credential securely in the OS keychain
 *
 * @param {string} name - Credential name (e.g., 'DIRECTUS_TOKEN')
 * @param {string} value - Credential value
 * @returns {Promise<boolean>} True if stored successfully
 */
async function setCredentialSecure(name, value) {
	const kt = getKeytar();
	if (!kt) {
		logger.warn('Keychain not available - install keytar package');
		return false;
	}

	try {
		await kt.setPassword(KEYCHAIN_SERVICE, name, value);
		logger.info('Credential stored in keychain', { name });
		return true;
	}
	catch (error) {
		logger.error('Failed to store credential in keychain', { name, error: error.message });
		return false;
	}
}

/**
 * Retrieve a credential from the OS keychain
 *
 * @param {string} name - Credential name
 * @returns {Promise<string|null>} Credential value or null
 */
async function getCredentialSecure(name) {
	const kt = getKeytar();
	if (!kt) {
		return null;
	}

	try {
		return await kt.getPassword(KEYCHAIN_SERVICE, name);
	}
	catch (error) {
		logger.error('Failed to retrieve credential from keychain', { name, error: error.message });
		return null;
	}
}

/**
 * Delete a credential from the OS keychain
 *
 * @param {string} name - Credential name
 * @returns {Promise<boolean>} True if deleted successfully
 */
async function deleteCredentialSecure(name) {
	const kt = getKeytar();
	if (!kt) {
		return false;
	}

	try {
		await kt.deletePassword(KEYCHAIN_SERVICE, name);
		logger.info('Credential removed from keychain', { name });
		return true;
	}
	catch (error) {
		logger.error('Failed to delete credential from keychain', { name, error: error.message });
		return false;
	}
}

/**
 * Load credentials from keychain into process.env
 * Call this before validateCredentials() to use keychain credentials
 *
 * @returns {Promise<number>} Number of credentials loaded
 */
async function loadCredentialsFromKeychain() {
	const kt = getKeytar();
	if (!kt) {
		return 0;
	}

	let loaded = 0;
	for (const name of Object.keys(REQUIRED_CREDENTIALS)) {
		if (!process.env[name]) {
			const value = await getCredentialSecure(name);
			if (value) {
				process.env[name] = value;
				loaded++;
			}
		}
	}

	if (loaded > 0) {
		logger.info('Credentials loaded from keychain', { count: loaded });
	}

	return loaded;
}

/**
 * Migrate credentials from .env to keychain
 * Useful for initial setup of secure storage
 *
 * @returns {Promise<number>} Number of credentials migrated
 */
async function migrateToKeychain() {
	const kt = getKeytar();
	if (!kt) {
		console.log('Keychain not available - install keytar: npm install keytar');
		return 0;
	}

	let migrated = 0;
	for (const [name, config] of Object.entries(REQUIRED_CREDENTIALS)) {
		const value = process.env[name];
		if (value && config.sensitive) {
			const success = await setCredentialSecure(name, value);
			if (success) {
				migrated++;
				console.log(`  Migrated ${name} to keychain`);
			}
		}
	}

	if (migrated > 0) {
		console.log(`\nMigrated ${migrated} credentials to keychain.`);
		console.log('You can now remove sensitive values from .env file.');
	}

	return migrated;
}

module.exports = {
	maskCredential,
	getCredential,
	validateCredentials,
	displayCredentialStatus,
	ensureCredentials,
	getMaskedCredentialSummary,
	CredentialManager,
	REQUIRED_CREDENTIALS,
	// Keychain functions
	isKeychainAvailable,
	setCredentialSecure,
	getCredentialSecure,
	deleteCredentialSecure,
	loadCredentialsFromKeychain,
	migrateToKeychain,
};
