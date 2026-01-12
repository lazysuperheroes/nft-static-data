/**
 * SchemaAdapter - Adapts NFT metadata to different database schemas
 *
 * Supports:
 * - TokenStaticData (Lazy dApp)
 * - SecureTradeMetadata (Marketplace)
 *
 * This enables the same scraping logic to write to either database schema
 * without modification to the core processing code.
 */

const config = require('../config');
const logger = require('./logger');

/**
 * Schema definitions with field mappings
 */
const SCHEMAS = {
	TokenStaticData: {
		tableName: 'TokenStaticData',
		primaryKey: 'uid',
		fields: {
			uid: { type: 'string', required: true },
			address: { type: 'string', required: true },
			serial: { type: 'integer', required: true },
			metadata: { type: 'string', required: false }, // IPFS URL
			rawMetadata: { type: 'text', required: false }, // JSON string
			image: { type: 'string', required: false },
			attributes: { type: 'string', required: false }, // JSON string
			nftName: { type: 'string', required: false },
			collection: { type: 'string', required: true },
			environment: { type: 'string', required: true },
		},
		/**
		 * Create UID for TokenStaticData
		 */
		createUid: (tokenId, serial) => `${tokenId}!${serial}`,
	},

	SecureTradeMetadata: {
		tableName: 'SecureTradeMetadata',
		primaryKey: 'uid',
		fields: {
			uid: { type: 'string', required: true },
			token_id: { type: 'string', required: true },
			serial_number: { type: 'integer', required: true },
			name: { type: 'string', required: false },
			collection: { type: 'string', required: true },
			cid: { type: 'string', required: false }, // Metadata CID
			image: { type: 'string', required: false },
			downloaded_to_file: { type: 'boolean', required: false, default: false },
			fully_enriched: { type: 'boolean', required: false, default: false },
			rawMetadataJson: { type: 'text', required: false },
		},
		/**
		 * Create UID for SecureTradeMetadata
		 */
		createUid: (tokenId, serial) => `${tokenId}-${serial}`,
	},
};

/**
 * Field mapping from normalized format to each schema
 */
const FIELD_MAPPINGS = {
	TokenStaticData: {
		tokenId: 'address',
		serial: 'serial',
		metadataUrl: 'metadata',
		rawMetadata: 'rawMetadata',
		image: 'image',
		attributes: 'attributes',
		name: 'nftName',
		collection: 'collection',
		environment: 'environment',
	},
	SecureTradeMetadata: {
		tokenId: 'token_id',
		serial: 'serial_number',
		metadataUrl: null, // Not stored directly
		rawMetadata: 'rawMetadataJson',
		image: 'image',
		attributes: null, // Not stored directly
		name: 'name',
		collection: 'collection',
		environment: null, // Not stored directly
		cid: 'cid',
		downloadedToFile: 'downloaded_to_file',
		fullyEnriched: 'fully_enriched',
	},
};

/**
 * Normalized NFT metadata representation
 * Used as intermediate format between scraping and database storage
 */
class NormalizedMetadata {
	constructor(data = {}) {
		this.tokenId = data.tokenId || null;
		this.serial = data.serial || null;
		this.metadataUrl = data.metadataUrl || null;
		this.rawMetadata = data.rawMetadata || null;
		this.image = data.image || null;
		this.attributes = data.attributes || null;
		this.name = data.name || null;
		this.collection = data.collection || null;
		this.environment = data.environment || null;
		this.cid = data.cid || null;
		this.downloadedToFile = data.downloadedToFile || false;
		this.fullyEnriched = data.fullyEnriched || false;
	}

	/**
	 * Create from scraped metadata
	 */
	static fromScraped(tokenId, serial, metadataUrl, metadataJson, collection, environment) {
		return new NormalizedMetadata({
			tokenId,
			serial,
			metadataUrl,
			rawMetadata: typeof metadataJson === 'string' ? metadataJson : JSON.stringify(metadataJson),
			image: metadataJson?.image || null,
			attributes: metadataJson?.attributes ? JSON.stringify(metadataJson.attributes) : null,
			name: metadataJson?.name || null,
			collection,
			environment,
			cid: extractCIDFromUrl(metadataUrl),
			downloadedToFile: false,
			fullyEnriched: true,
		});
	}
}

/**
 * Extract CID from IPFS/Arweave URL
 */
function extractCIDFromUrl(url) {
	if (!url) return null;

	if (url.toLowerCase().includes('ar://') || url.toLowerCase().includes('arweave')) {
		const cleanURL = url.replace(/^ar:\/\/|https:\/\/arweave\.net\//, '');
		return cleanURL.split('/')[0];
	}

	if (!url.toLowerCase().includes('ipfs')) {
		return url.split('/')[0];
	}

	const cleanIPFS = url.replace(/^ipfs:\/\/|https:\/\/ipfs\.infura\.io\/ipfs\/|https:\/\/cloudflare-ipfs\.com\/ipfs\//, '');
	return cleanIPFS.split('/')[0];
}

/**
 * SchemaAdapter - Converts between normalized metadata and schema-specific formats
 */
class SchemaAdapter {
	constructor(schemaName) {
		if (!SCHEMAS[schemaName]) {
			throw new Error(`Unknown schema: ${schemaName}. Valid schemas: ${Object.keys(SCHEMAS).join(', ')}`);
		}
		this.schemaName = schemaName;
		this.schema = SCHEMAS[schemaName];
		this.fieldMapping = FIELD_MAPPINGS[schemaName];
	}

	/**
	 * Get the database table name
	 */
	getTableName() {
		return this.schema.tableName;
	}

	/**
	 * Create a UID for this schema
	 */
	createUid(tokenId, serial) {
		return this.schema.createUid(tokenId, serial);
	}

	/**
	 * Convert normalized metadata to schema-specific format
	 */
	toSchemaFormat(normalizedData) {
		const result = {
			uid: this.createUid(normalizedData.tokenId, normalizedData.serial),
		};

		for (const [normalizedField, schemaField] of Object.entries(this.fieldMapping)) {
			if (schemaField && normalizedData[normalizedField] !== undefined) {
				result[schemaField] = normalizedData[normalizedField];
			}
		}

		return result;
	}

	/**
	 * Convert schema-specific format to normalized metadata
	 */
	fromSchemaFormat(schemaData) {
		const result = {};

		for (const [normalizedField, schemaField] of Object.entries(this.fieldMapping)) {
			if (schemaField && schemaData[schemaField] !== undefined) {
				result[normalizedField] = schemaData[schemaField];
			}
		}

		return new NormalizedMetadata(result);
	}

	/**
	 * Convert a list of normalized metadata to schema format
	 */
	toSchemaFormatBatch(normalizedList) {
		return normalizedList.map(item => this.toSchemaFormat(item));
	}

	/**
	 * Convert a list of schema data to normalized format
	 */
	fromSchemaFormatBatch(schemaList) {
		return schemaList.map(item => this.fromSchemaFormat(item));
	}

	/**
	 * Get the field name for token ID in this schema
	 */
	getTokenIdField() {
		return this.fieldMapping.tokenId;
	}

	/**
	 * Get the field name for serial number in this schema
	 */
	getSerialField() {
		return this.fieldMapping.serial;
	}

	/**
	 * Validate data against schema
	 */
	validate(data) {
		const errors = [];

		for (const [fieldName, fieldDef] of Object.entries(this.schema.fields)) {
			if (fieldDef.required && (data[fieldName] === undefined || data[fieldName] === null)) {
				errors.push(`Missing required field: ${fieldName}`);
			}
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}
}

/**
 * Create an adapter for the configured schema
 */
function createAdapter(schemaName = null) {
	const schema = schemaName || config.database?.schema || 'TokenStaticData';
	return new SchemaAdapter(schema);
}

/**
 * Get list of available schemas
 */
function getAvailableSchemas() {
	return Object.keys(SCHEMAS);
}

module.exports = {
	SchemaAdapter,
	NormalizedMetadata,
	createAdapter,
	getAvailableSchemas,
	SCHEMAS,
	FIELD_MAPPINGS,
	extractCIDFromUrl,
};
