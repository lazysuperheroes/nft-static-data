/**
 * Input Validation Module
 * Comprehensive validation with helpful error messages
 */

class ValidationError extends Error {
	constructor(message, field) {
		super(message);
		this.field = field;
		this.name = 'ValidationError';
	}
}

/**
 * Validate Hedera token address format
 * @param {string} address - Token address to validate
 * @param {boolean} throwOnError - Whether to throw error or return boolean
 * @returns {boolean} - True if valid
 * @throws {ValidationError} - If invalid and throwOnError is true
 */
function validateTokenAddress(address, throwOnError = true) {
	if (!address) {
		if (throwOnError) {
			throw new ValidationError('Token address is required', 'address');
		}
		return false;
	}

	const addressPattern = /^\d+\.\d+\.\d+$/;
	if (!addressPattern.test(address)) {
		if (throwOnError) {
			throw new ValidationError(
				`Invalid address format: "${address}". Expected format: 0.0.XXXXXX`,
				'address',
			);
		}
		return false;
	}

	const parts = address.split('.');
	if (parts[0] !== '0' || parts[1] !== '0') {
		console.warn('⚠️  Warning: Unusual shard/realm numbers. Are you sure this is correct?');
		console.warn(`   Expected: 0.0.XXXXX, Got: ${address}`);
	}

	return true;
}

/**
 * Validate a list of token addresses
 * @param {string[]} addresses - Array of addresses to validate
 * @returns {Object} - Object with valid and invalid addresses
 */
function validateTokenAddresses(addresses) {
	const valid = [];
	const invalid = [];

	for (const address of addresses) {
		try {
			if (validateTokenAddress(address, true)) {
				valid.push(address);
			}
		}
		catch (error) {
			invalid.push({ address, error: error.message });
		}
	}

	return { valid, invalid };
}

/**
 * Validate environment selection
 * @param {string} env - Environment to validate
 * @returns {boolean} - True if valid
 * @throws {ValidationError} - If invalid
 */
function validateEnvironment(env) {
	const validEnvironments = ['MAIN', 'TEST', 'PREVIEW', 'mainnet', 'testnet', 'previewnet'];

	if (!validEnvironments.includes(env)) {
		throw new ValidationError(
			`Invalid environment: "${env}". Must be one of: ${validEnvironments.join(', ')}`,
			'environment',
		);
	}

	return true;
}

/**
 * Validate serial numbers
 * @param {number[]} serials - Array of serial numbers
 * @returns {boolean} - True if valid
 * @throws {ValidationError} - If invalid
 */
function validateSerials(serials) {
	if (!Array.isArray(serials) || serials.length === 0) {
		throw new ValidationError('Serials must be a non-empty array', 'serials');
	}

	for (const serial of serials) {
		if (!Number.isInteger(serial) || serial < 1) {
			throw new ValidationError(
				`Invalid serial number: ${serial}. Must be a positive integer.`,
				'serials',
			);
		}
	}

	return true;
}

/**
 * Validate CID format (IPFS CIDv0 or CIDv1)
 * @param {string} cid - CID to validate
 * @returns {boolean} - True if valid
 */
function validateCID(cid) {
	if (!cid || typeof cid !== 'string') {
		return false;
	}

	const cidPattern = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[0-9A-Za-z]{58})$/;
	return cidPattern.test(cid);
}

/**
 * Validate Arweave CID format
 * @param {string} cid - Arweave CID to validate
 * @returns {boolean} - True if valid
 */
function validateArweaveCID(cid) {
	if (!cid || typeof cid !== 'string') {
		return false;
	}

	const cidPattern = /^[a-zA-Z0-9_-]{43}$/;
	return cidPattern.test(cid);
}

module.exports = {
	ValidationError,
	validateTokenAddress,
	validateTokenAddresses,
	validateEnvironment,
	validateSerials,
	validateCID,
	validateArweaveCID,
};
