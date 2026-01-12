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

		// Enhanced error tracking with categorization
		// Categories: fetchMetadata, pinMetadata, pinImage, databaseWrite, gatewayTimeout, invalidCID, other
		this.errors = {
			fetchMetadata: [],
			pinMetadata: [],
			pinImage: [],
			databaseWrite: [],
			gatewayTimeout: [],
			invalidCID: [],
			other: [],
		};

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
		// Lazy initialization - created on first use via getSchemaWriter()
		this.schemaWriter = options.schemaWriter || null;

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
		// Reset categorized errors
		this.errors = {
			fetchMetadata: [],
			pinMetadata: [],
			pinImage: [],
			databaseWrite: [],
			gatewayTimeout: [],
			invalidCID: [],
			other: [],
		};
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
	 * Record a categorized error with full details
	 * @param {string} category - Error category: fetchMetadata, pinMetadata, pinImage, databaseWrite, gatewayTimeout, invalidCID, other
	 * @param {object} details - Error details
	 */
	recordCategorizedError(category, details) {
		const errorEntry = {
			timestamp: Date.now(),
			tokenId: details.tokenId || this.tokenId,
			serial: details.serial,
			cid: details.cid || null,
			gateway: details.gateway || null,
			message: details.message || details.error?.message || 'Unknown error',
			stack: details.error?.stack || null,
			retryCount: details.retryCount || 0,
		};

		if (this.errors[category]) {
			this.errors[category].push(errorEntry);
		}
		else {
			this.errors.other.push({ ...errorEntry, category });
		}

		// Also add to legacy errorSerials for backward compatibility
		if (details.serial) {
			this.errorSerials.push(`${errorEntry.tokenId}${details.serial}`);
		}

		// Log to winston
		logger.error(`Processing error: ${category}`, errorEntry);
	}

	/**
	 * Get total error count across all categories
	 */
	getTotalErrorCount() {
		return Object.values(this.errors).reduce((sum, arr) => sum + arr.length, 0);
	}

	/**
	 * Get error summary by category
	 */
	getErrorSummary() {
		const summary = {};
		for (const [category, errors] of Object.entries(this.errors)) {
			if (errors.length > 0) {
				summary[category] = {
					count: errors.length,
					samples: errors.slice(0, 3).map(e => ({
						serial: e.serial,
						cid: e.cid,
						message: e.message,
					})),
				};
			}
		}
		return summary;
	}

	/**
	 * Get all errors as a flat list for analysis
	 */
	getAllErrors() {
		const allErrors = [];
		for (const [category, errors] of Object.entries(this.errors)) {
			for (const error of errors) {
				allErrors.push({ category, ...error });
			}
		}
		return allErrors.sort((a, b) => a.timestamp - b.timestamp);
	}

	/**
	 * Export errors to JSON file for analysis
	 */
	async exportErrors(filePath = null) {
		const fs = require('fs').promises;
		const path = require('path');

		const exportPath = filePath || path.join(
			config.cache.progressStateDir,
			`errors-${this.tokenId || 'unknown'}-${Date.now()}.json`,
		);

		const exportData = {
			tokenId: this.tokenId,
			collection: this.collection,
			environment: this.environment,
			exportTime: new Date().toISOString(),
			summary: this.getErrorSummary(),
			totalErrors: this.getTotalErrorCount(),
			errors: this.getAllErrors(),
		};

		await fs.mkdir(path.dirname(exportPath), { recursive: true });
		await fs.writeFile(exportPath, JSON.stringify(exportData, null, 2));
		logger.info('Errors exported', { path: exportPath, count: this.getTotalErrorCount() });
		return exportPath;
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
			errorsByCategory: this.getErrorSummary(),
			totalCategorizedErrors: this.getTotalErrorCount(),
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
			errors: this.errors,
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
		// Restore categorized errors if present
		if (json.errors) {
			ctx.errors = json.errors;
		}
		ctx.startTime = json.startTime || Date.now();
		return ctx;
	}
}

module.exports = ProcessingContext;
