/**
 * NFT Static Data - Main Export
 *
 * Clean API for using this package as a library.
 *
 * Usage:
 *   const { getStaticDataViaMirrors, ProcessingContext } = require('@your-org/nft-static-data');
 *
 * Or import specific utilities:
 *   const { createAdapter } = require('@your-org/nft-static-data/utils/schemaAdapter');
 */

// Core scraping functionality
const { getStaticDataViaMirrors, extractCIDFromUrl } = require('./utils/metadataScrapeHelper');
const ProcessingContext = require('./utils/ProcessingContext');

// Schema management
const { SchemaAdapter, NormalizedMetadata, createAdapter, getAvailableSchemas, SCHEMAS } = require('./utils/schemaAdapter');
const { SchemaWriter, createWriter } = require('./utils/schemaWriter');

// Database operations
const {
	getStaticData,
	TokenStaticData,
	writeStaticData,
	getStaticDataToken,
	isValidCID,
	checkCIDExists,
	writeCIDData,
	pinIPFS,
	confirmPin,
	isValidArweaveCID,
	preloadCIDCacheFromDB,
	getCIDCacheSize,
	loadCIDCache,
	saveCIDCache,
} = require('./utils/tokenStaticDataHelper');

// Hedera helpers
const {
	getBaseURL,
	getTokenDetails,
	checkMirrorBalance,
	checkMirrorAllowance,
} = require('./utils/hederaMirrorHelpers');

// Credential management
const {
	maskCredential,
	validateCredentials,
	ensureCredentials,
	isKeychainAvailable,
	loadCredentialsFromKeychain,
} = require('./utils/credentialManager');

// Configuration
const config = require('./config');

module.exports = {
	// Core API
	getStaticDataViaMirrors,
	ProcessingContext,

	// Schema
	SchemaAdapter,
	SchemaWriter,
	NormalizedMetadata,
	createAdapter,
	createWriter,
	getAvailableSchemas,
	SCHEMAS,

	// Database
	TokenStaticData,
	getStaticData,
	writeStaticData,
	getStaticDataToken,

	// IPFS/CID
	isValidCID,
	isValidArweaveCID,
	checkCIDExists,
	writeCIDData,
	pinIPFS,
	confirmPin,
	extractCIDFromUrl,

	// Cache
	preloadCIDCacheFromDB,
	getCIDCacheSize,
	loadCIDCache,
	saveCIDCache,

	// Hedera
	getBaseURL,
	getTokenDetails,
	checkMirrorBalance,
	checkMirrorAllowance,

	// Credentials
	maskCredential,
	validateCredentials,
	ensureCredentials,
	isKeychainAvailable,
	loadCredentialsFromKeychain,

	// Config
	config,
};
