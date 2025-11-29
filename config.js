/**
 * Configuration file for NFT Static Data Uploader
 * Centralized settings for easy customization
 */

module.exports = {
	// Processing settings
	processing: {
		maxRetries: 18,
		concurrentRequests: 10,
		timeoutMs: 30000,
		validatePinsBatchSize: 20,
	},

	// IPFS settings
	ipfs: {
		gateways: [
			'https://cloudflare-ipfs.com/ipfs/',
			'https://ipfs.eth.aragon.network/ipfs/',
			'https://ipfs.io/ipfs/',
			'https://ipfs.eternum.io/ipfs/',
			'https://cloudflare-ipfs.com/ipfs/',
			'dweb',
		],
		pinBatchSize: 20,
		filebaseGateway: 'https://lazysuperheroes.myfilebase.com/ipfs/',
	},

	// Arweave settings
	arweave: {
		gateways: [
			'https://arweave.net/',
			'https://ar-io.dev/',
			'https://permagate.io/',
			'https://arweave.developerdao.com/',
		],
	},

	// Database settings
	database: {
		writeBatchSize: 50,
		queryLimit: 100,
	},

	// Cache settings
	cache: {
		cidCacheFile: './cache/cid-cache.json',
		progressStateDir: './state',
	},

	// Logging settings
	logging: {
		level: 'info',
		errorLogFile: 'logs/error.log',
		combinedLogFile: 'logs/combined.log',
		consoleOutput: true,
	},

	// Rate limiting
	rateLimiting: {
		maxConcurrent: 5,
		minTimeBetweenRequests: 100,
	},
};
