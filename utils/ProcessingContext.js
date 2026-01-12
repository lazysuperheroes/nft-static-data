/**
 * ProcessingContext - Encapsulates state for a single metadata scraping job
 *
 * This class eliminates global mutable state by creating an isolated context
 * for each processing job. This enables:
 * - Concurrent processing of multiple tokens without state collision
 * - Clean isolation between jobs
 * - Proper cleanup after job completion
 * - Resume capability with serializable state
 */

const GatewayManager = require('./gatewayManager');
const { createWriter } = require('./schemaWriter');
const config = require('../config');
const logger = require('./logger');

class ProcessingContext {
	constructor(options = {}) {
		// Job identification
		this.tokenId = options.tokenId || null;
		this.collection = options.collection || null;
		this.environment = options.environment || null;

		// Progress tracking
		this.totalCompleted = 0;
		this.totalToProcess = 0;
		this.actualTotal = 0;
		this.errorSerials = [];

		// Configuration
		this.dryRun = options.dryRun || false;
		this.maxRetries = options.maxRetries || config.processing.maxRetries;

		// Gateway managers (can be shared or per-context)
		this.ipfsGatewayManager = options.ipfsGatewayManager ||
			new GatewayManager(config.ipfs.gateways, 'ipfs');
		this.arweaveGatewayManager = options.arweaveGatewayManager ||
			new GatewayManager(config.arweave.gateways, 'arweave');

		// Callbacks
		this.progressCallback = options.progressCallback || null;

		// Schema support
		this.schemaName = options.schema || config.database?.schema || 'TokenStaticData';
		this.schemaWriter = options.schemaWriter || null; // Lazy initialization

		// Environment mapping
		this.envMap = new Map([
			['MAIN', 'mainnet'],
			['TEST', 'testnet'],
			['PREVIEW', 'previewnet'],
		]);

		// Timestamps
		this.startTime = null;
		this.endTime = null;
	}

	/**
	 * Initialize the context for a new job
	 */
	start() {
		this.startTime = Date.now();
		this.totalCompleted = 0;
		this.totalToProcess = 0;
		this.actualTotal = 0;
		this.errorSerials = [];
		logger.info('Processing context started', {
			tokenId: this.tokenId,
			collection: this.collection,
			environment: this.environment,
		});
	}

	/**
	 * Mark the context as complete
	 */
	complete() {
		this.endTime = Date.now();
		const duration = this.endTime - this.startTime;
		logger.info('Processing context completed', {
			tokenId: this.tokenId,
			completed: this.totalCompleted,
			errors: this.errorSerials.length,
			durationMs: duration,
		});
	}

	/**
	 * Increment completed count and optionally report progress
	 */
	incrementCompleted() {
		this.totalCompleted++;
		this.reportProgress();
	}

	/**
	 * Add items to process count
	 */
	addToProcess(count) {
		this.totalToProcess += count;
	}

	/**
	 * Set the actual total (from token supply)
	 */
	setActualTotal(total) {
		this.actualTotal = Math.max(total, this.totalToProcess);
	}

	/**
	 * Record an error for a serial
	 */
	recordError(serial, error = null) {
		this.errorSerials.push({
			serial,
			error: error?.message || 'Unknown error',
			timestamp: Date.now(),
		});
	}

	/**
	 * Record a simple error serial (backward compatible)
	 */
	recordErrorSerial(tokenId, serial) {
		this.errorSerials.push(`${tokenId}${serial}`);
	}

	/**
	 * Report progress via callback
	 */
	reportProgress() {
		if (this.progressCallback && this.actualTotal > 0) {
			this.progressCallback(
				this.totalCompleted,
				this.actualTotal,
				this.errorSerials.length,
			);
		}
	}

	/**
	 * Get the mapped environment name
	 */
	getMappedEnv(env) {
		return this.envMap.get(env) || env.toLowerCase();
	}

	/**
	 * Get schema writer (lazy initialization)
	 */
	getSchemaWriter() {
		if (!this.schemaWriter) {
			this.schemaWriter = createWriter(this.schemaName);
		}
		return this.schemaWriter;
	}

	/**
	 * Check if using normalized schema mode
	 */
	isNormalizedMode() {
		return this.schemaName !== 'TokenStaticData';
	}

	/**
	 * Print gateway statistics
	 */
	printStats() {
		this.ipfsGatewayManager.printStats();
		this.arweaveGatewayManager.printStats();
	}

	/**
	 * Check if processing is complete
	 */
	isComplete() {
		return this.totalCompleted >= this.totalToProcess && this.totalToProcess > 0;
	}

	/**
	 * Get a summary of the processing job
	 */
	getSummary() {
		return {
			tokenId: this.tokenId,
			collection: this.collection,
			environment: this.environment,
			completed: this.totalCompleted,
			total: this.actualTotal,
			errors: this.errorSerials.length,
			errorSerials: this.errorSerials,
			durationMs: this.endTime ? (this.endTime - this.startTime) : null,
			dryRun: this.dryRun,
		};
	}

	/**
	 * Serialize context for resume capability
	 */
	toJSON() {
		return {
			tokenId: this.tokenId,
			collection: this.collection,
			environment: this.environment,
			totalCompleted: this.totalCompleted,
			totalToProcess: this.totalToProcess,
			actualTotal: this.actualTotal,
			errorSerials: this.errorSerials,
			dryRun: this.dryRun,
			startTime: this.startTime,
			schemaName: this.schemaName,
		};
	}

	/**
	 * Restore context from serialized state (for resume)
	 */
	static fromJSON(json, options = {}) {
		const ctx = new ProcessingContext({
			tokenId: json.tokenId,
			collection: json.collection,
			environment: json.environment,
			dryRun: json.dryRun,
			schema: json.schemaName,
			...options,
		});
		ctx.totalCompleted = json.totalCompleted || 0;
		ctx.totalToProcess = json.totalToProcess || 0;
		ctx.actualTotal = json.actualTotal || 0;
		ctx.errorSerials = json.errorSerials || [];
		ctx.startTime = json.startTime || Date.now();
		return ctx;
	}
}

module.exports = ProcessingContext;
