/**
 * SchemaWriter - Schema-aware database operations
 *
 * Provides database read/write operations that work with any supported schema
 * through the SchemaAdapter pattern.
 */

const { createDirectus, staticToken, rest, readItems, createItems, deleteItems, updateItem } = require('@directus/sdk');
const { createAdapter, NormalizedMetadata, extractCIDFromUrl } = require('./schemaAdapter');
const config = require('../config');
const logger = require('./logger');
require('dotenv').config();

/**
 * SchemaWriter - Handles database operations for a specific schema
 */
class SchemaWriter {
	constructor(schemaName = null) {
		this.adapter = createAdapter(schemaName);
		this.client = createDirectus(process.env.DIRECTUS_DB_URL).with(rest());
		// Lazy initialization
		this.writeClient = null;
	}

	/**
	 * Get write client (with auth token)
	 */
	getWriteClient() {
		if (!this.writeClient) {
			this.writeClient = createDirectus(process.env.DIRECTUS_DB_URL)
				.with(staticToken(process.env.DIRECTUS_TOKEN))
				.with(rest());
		}
		return this.writeClient;
	}

	/**
	 * Get the table name being used
	 */
	getTableName() {
		return this.adapter.getTableName();
	}

	/**
	 * Get existing serials for a token address
	 */
	async getExistingSerials(tokenId) {
		const tableName = this.adapter.getTableName();
		const tokenIdField = this.adapter.getTokenIdField();
		const serialField = this.adapter.getSerialField();

		console.log('Filtering for', tokenId, 'in', tableName);
		const serialList = [];
		let data;
		let maxSerial = 0;

		do {
			const filter = {
				[tokenIdField]: { _eq: tokenId },
			};

			if (maxSerial > 0) {
				filter[serialField] = { _gt: maxSerial };
			}

			data = await this.client.request(readItems(tableName, {
				filter,
				sort: serialField,
				limit: config.database.queryLimit,
			}));

			if (data.length > 0) {
				maxSerial = data.reduce((max, item) => {
					return Math.max(max, item[serialField]);
				}, 0);
			}

			serialList.push(...data.map(item => item[serialField]));
		} while (data.length > 0);

		return serialList;
	}

	/**
	 * Write normalized metadata to database
	 */
	async writeMetadata(normalizedDataList, existingSerials = [], dryRun = false) {
		if (normalizedDataList.length === 0) {
			return { written: 0, skipped: 0 };
		}

		// Filter out existing serials
		const toWrite = normalizedDataList.filter(
			item => !existingSerials.includes(item.serial),
		);

		if (toWrite.length === 0) {
			return { written: 0, skipped: normalizedDataList.length };
		}

		if (dryRun) {
			console.log(`DRY RUN: Would write ${toWrite.length} items to ${this.getTableName()}`);
			logger.info('Dry run: database write skipped', {
				count: toWrite.length,
				table: this.getTableName(),
			});
			return { written: 0, skipped: 0, dryRun: true };
		}

		// Convert to schema format
		const schemaData = this.adapter.toSchemaFormatBatch(toWrite);

		console.log('Writing', schemaData.length, 'items to', this.getTableName());
		logger.info('Writing to database', {
			count: schemaData.length,
			table: this.getTableName(),
		});

		const batchSize = config.database.writeBatchSize;
		const batches = [];

		for (let i = 0; i < schemaData.length; i += batchSize) {
			batches.push(schemaData.slice(i, i + batchSize));
		}

		let totalWritten = 0;
		const writeClient = this.getWriteClient();
		const tableName = this.getTableName();

		for (let i = 0; i < batches.length; i++) {
			const batch = batches[i];
			try {
				const data = await writeClient.request(createItems(tableName, batch));
				totalWritten += data.length;
				console.log(`Batch ${i + 1}/${batches.length}: ${data.length} items written`);
				logger.info('Batch write successful', {
					batch: i + 1,
					total: batches.length,
					count: data.length,
				});
			}
			catch (error) {
				console.error(`Batch ${i + 1}/${batches.length} failed, retrying individually...`);
				logger.error('Batch write failed, retrying individually', {
					batch: i + 1,
					error: error.message,
				});

				for (const item of batch) {
					try {
						await writeClient.request(createItems(tableName, [item]));
						totalWritten++;
					}
					catch (itemError) {
						const serialField = this.adapter.getSerialField();
						console.error(`  Failed to write serial ${item[serialField]}:`, itemError.message);
						logger.error('Individual item write failed', {
							serial: item[serialField],
							error: itemError.message,
						});
					}
				}
			}
		}

		console.log(`Total written: ${totalWritten} items`);
		logger.logDatabaseOperation('write', totalWritten, true);

		return { written: totalWritten, skipped: normalizedDataList.length - toWrite.length };
	}

	/**
	 * Delete all records for a token
	 */
	async deleteToken(tokenId) {
		const tableName = this.getTableName();
		const tokenIdField = this.adapter.getTokenIdField();

		console.log('Deleting', tokenId, 'from', tableName);
		logger.info('Deleting token data', { tokenId, table: tableName });

		const writeClient = this.getWriteClient();
		await writeClient.request(deleteItems(tableName, {
			filter: {
				[tokenIdField]: { _eq: tokenId },
			},
		}));
	}

	/**
	 * Get metadata for specific serials
	 */
	async getMetadata(tokenId, serials) {
		const tableName = this.getTableName();
		const tokenIdField = this.adapter.getTokenIdField();
		const serialField = this.adapter.getSerialField();

		console.log('Filtering for', tokenId, serials, 'in', tableName);

		const data = await this.client.request(readItems(tableName, {
			filter: {
				[tokenIdField]: { _eq: tokenId },
				[serialField]: { _in: serials },
			},
		}));

		return this.adapter.fromSchemaFormatBatch(data);
	}

	/**
	 * Update enrichment status (SecureTradeMetadata specific)
	 */
	async updateEnrichmentStatus(uid, downloaded = false, fullyEnriched = false) {
		if (this.adapter.schemaName !== 'SecureTradeMetadata') {
			logger.warn('updateEnrichmentStatus only applicable to SecureTradeMetadata');
			return;
		}

		const writeClient = this.getWriteClient();
		await writeClient.request(updateItem(this.getTableName(), uid, {
			downloaded_to_file: downloaded,
			fully_enriched: fullyEnriched,
		}));
	}
}

/**
 * Factory function to create a writer for the configured schema
 */
function createWriter(schemaName = null) {
	return new SchemaWriter(schemaName);
}

module.exports = {
	SchemaWriter,
	createWriter,
	NormalizedMetadata,
	extractCIDFromUrl,
};
