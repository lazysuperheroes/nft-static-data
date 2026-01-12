const { createDirectus, staticToken, rest, readItems, createItems, deleteItems, updateItem } = require('@directus/sdk');
const axios = require('axios');
const { checkPinHttp, LSH_IPFS_GATEWAY, checkPinStatus } = require('./filebaseHelper');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const logger = require('./logger');
require('dotenv').config();

const filebasePinningService = process.env.FILEBASE_PINNING_SERVICE;
const filebasePinningApiKey = process.env.FILEBASE_PINNING_API_KEY;

const cidMap = new Map();

const client = createDirectus(process.env.DIRECTUS_DB_URL).with(rest());

/**
 * Load CID cache from file
 */
async function loadCIDCache() {
	try {
		const cacheDir = path.dirname(config.cache.cidCacheFile);
		await fs.mkdir(cacheDir, { recursive: true });

		const data = await fs.readFile(config.cache.cidCacheFile, 'utf8');
		const entries = JSON.parse(data);
		entries.forEach(([key, value]) => cidMap.set(key, value));
		console.log(`Loaded ${cidMap.size} CIDs from file cache`);
		logger.info('CID cache loaded from file', { count: cidMap.size });
	}
	catch (error) {
		console.log('No cache file found, starting fresh');
		logger.info('Starting with empty CID cache');
	}
}

/**
 * Preload CID cache from database
 * Call this before processing to reduce database lookups
 *
 * @param {number} batchSize - Number of CIDs to fetch per query (default: 1000)
 * @returns {Promise<number>} Number of CIDs loaded
 */
async function preloadCIDCacheFromDB(batchSize = 1000) {
	const startTime = Date.now();
	const initialSize = cidMap.size;
	let page = 0;
	let totalLoaded = 0;

	console.log('Preloading CID cache from database...');
	logger.info('Starting CID cache preload from database');

	try {
		let hasMore = true;
		while (hasMore) {
			const data = await client.request(readItems('cidDB', {
				fields: ['cid'],
				limit: batchSize,
				page: page + 1, // Directus uses 1-based pages
			}));

			if (data.length === 0) {
				hasMore = false;
			}
			else {
				for (const item of data) {
					if (item.cid && !cidMap.has(item.cid)) {
						cidMap.set(item.cid, true);
						totalLoaded++;
					}
				}
				page++;

				// Progress logging every 5000 CIDs
				if (totalLoaded > 0 && totalLoaded % 5000 === 0) {
					console.log(`  ...loaded ${totalLoaded} CIDs so far`);
				}
			}
		}

		const duration = Date.now() - startTime;
		console.log(`Preloaded ${totalLoaded} CIDs from database (${cidMap.size} total in cache) in ${duration}ms`);
		logger.info('CID cache preload complete', {
			loaded: totalLoaded,
			total: cidMap.size,
			durationMs: duration,
		});

		// Save the updated cache to file
		await saveCIDCache();

		return totalLoaded;
	}
	catch (error) {
		logger.error('Failed to preload CID cache from database', { error: error.message });
		console.error('Error preloading CID cache:', error.message);
		return 0;
	}
}

/**
 * Get current CID cache size
 */
function getCIDCacheSize() {
	return cidMap.size;
}

/**
 * Clear the CID cache (useful for testing)
 */
function clearCIDCache() {
	cidMap.clear();
	logger.info('CID cache cleared');
}

/**
 * Save CID cache to file
 */
async function saveCIDCache() {
	try {
		const cacheDir = path.dirname(config.cache.cidCacheFile);
		await fs.mkdir(cacheDir, { recursive: true });

		const entries = Array.from(cidMap.entries());
		await fs.writeFile(config.cache.cidCacheFile, JSON.stringify(entries));
		logger.info('CID cache saved', { count: entries.length });
	}
	catch (error) {
		logger.error('Failed to save CID cache', { error: error.message });
	}
}

loadCIDCache().catch(err => console.error('Error loading CID cache:', err));

async function getPost() {
	const data = await client.request(readItems('post'));
	console.log(data);

}

/**
 * Query directus for Static Data
 * @param {*} address Hedera address as string 0.0.XXX
 * @param {Number[]} serials list of serials
 */
async function getStaticData(address, serials) {
	console.log('Filtering for', address, serials);
	return await client.request(readItems('TokenStaticData', {
		filter: {
			address: {
				_eq: address,
			},
			serial: {
				_in: serials,
			},
		},
	}));
}

async function getEligibleNfts(environment) {
	return await client.request(readItems('eligibleNfts', {
		filter: {
			Environment: {
				_eq: environment,
			},
		},
	}));
}

// method to get the static data for a given address
// to allow filtering out of existing data
async function getStaticDataToken(address) {
	console.log('Filtering for', address);
	const serialList = [];
	let data;
	let maxSerial = 0;
	do {
		// only gets 100 items
		if (maxSerial > 0) {
			data = await client.request(readItems('TokenStaticData', {
				filter: {
					address: {
						_eq: address,
					},
					serial: {
						_gt: maxSerial,
					},
				},
				sort: 'serial',
			}));
		}
		else {
			data = await client.request(readItems('TokenStaticData', {
				filter: {
					address: {
						_eq: address,
					},
				},
				sort: 'serial',
			}));
		}

		// get the max serial
		if (data.length > 0) {
			maxSerial = data.reduce((max, item) => {
				return Math.max(max, item.serial);
			}, 0);
		}

		// push data.serial to serialList
		serialList.push(...data.map((item) => item.serial));

	} while (data.length != 0);

	return serialList;
}

/**
 * Deletes in batches of 100
 * @param {String} address
 */
async function deleteAddress(address) {
	console.log('Deleting', address);
	const writeClient = createDirectus(process.env.DIRECTUS_DB_URL).with(staticToken(process.env.DIRECTUS_TOKEN)).with(rest());
	await writeClient.request(deleteItems('TokenStaticData', {
		filter: {
			address: {
				_eq: address,
			},
		},
	}));
}

async function writeStaticData(tokenStaticDataList, existingSerials, dryRun = false) {
	if (tokenStaticDataList.length == 0) {
		return;
	}

	tokenStaticDataList = tokenStaticDataList.filter((item) => !existingSerials.includes(item.serial));

	if (dryRun) {
		console.log(`🔍 DRY RUN: Would write ${tokenStaticDataList.length} items`);
		logger.info('Dry run: database write skipped', { count: tokenStaticDataList.length });
		return;
	}

	console.log('Writing', tokenStaticDataList.length, 'items');
	logger.info('Writing to database', { count: tokenStaticDataList.length });

	const batchSize = config.database.writeBatchSize;
	const batches = [];

	for (let i = 0; i < tokenStaticDataList.length; i += batchSize) {
		batches.push(tokenStaticDataList.slice(i, i + batchSize));
	}

	let totalWritten = 0;
	const writeClient = createDirectus(process.env.DIRECTUS_DB_URL).with(staticToken(process.env.DIRECTUS_TOKEN)).with(rest());

	for (let i = 0; i < batches.length; i++) {
		const batch = batches[i];
		try {
			const data = await writeClient.request(createItems('TokenStaticData', batch));
			totalWritten += data.length;
			console.log(`✓ Batch ${i + 1}/${batches.length}: ${data.length} items written`);
			logger.info('Batch write successful', { batch: i + 1, total: batches.length, count: data.length });
		}
		catch (error) {
			console.error(`✗ Batch ${i + 1}/${batches.length} failed, retrying individually...`);
			logger.error('Batch write failed, retrying individually', { batch: i + 1, error: error.message });

			for (const item of batch) {
				try {
					await writeClient.request(createItems('TokenStaticData', [item]));
					totalWritten++;
				}
				catch (itemError) {
					console.error(`  ✗ Failed to write serial ${item.serial}:`, itemError.message);
					logger.error('Individual item write failed', {
						serial: item.serial,
						address: item.address,
						error: itemError.message,
					});
				}
			}
		}
	}

	console.log(`✓ Total written: ${totalWritten} items`);
	logger.logDatabaseOperation('write', totalWritten, true);
}

async function writeEligibleNfts(eligibleNfts) {
	if (eligibleNfts.length == 0) {
		return;
	}
	else {
		// write to directus
		// create a new client with the static token
		console.log('Writing', eligibleNfts.length, 'items');
	}
	const writeClient = createDirectus(process.env.DIRECTUS_DB_URL).with(staticToken(process.env.DIRECTUS_TOKEN)).with(rest());
	const data = await writeClient.request(createItems('eligibleNfts', eligibleNfts));
	console.log(data.length, 'items created');
}

// define a Class for the TokenStaticData items with the same fields as the table
// uid, Address, Serial, Metadata, RawMetadata, Image, Attributes, NFTName, Collection
class TokenStaticData {
	constructor(uid, address, serial, metadata, rawMetadata, image, attributes, nftName, collection, environment) {
		this.uid = uid;
		this.address = address;
		this.serial = serial;
		this.metadata = metadata;
		this.rawMetadata = rawMetadata;
		this.image = image;
		this.attributes = attributes;
		this.nftName = nftName;
		this.collection = collection;
		this.environment = environment;
	}

	// define a toString()
	toString() {
		return `TokenStaticData: ${this.uid}, ${this.address}, ${this.serial}, ${this.metadata}, ${this.rawMetadata}, ${this.image}, ${this.attributes}, ${this.nftName}, ${this.collection}, ${this.environment}`;
	}

	toObject() {
		return {
			uid: this.uid,
			address: this.address,
			serial: this.serial,
			metadata: this.metadata,
			rawMetadata: this.rawMetadata,
			image: this.image,
			attributes: this.attributes,
			nftName: this.nftName,
			collection: this.collection,
			environment: this.environment,
		};
	}
}

class EligibleNft {
	constructor(tokenId, evmTokenId, NiceName, Environment) {
		this.AllowedTypes = Object.freeze({
			STAKING: 'staking',
			STAKING_BOOST: 'staking_boost',
			MISSION_REQ: 'mission_req',
			GEM_BOOST: 'gem_boost',
			NULL: null,
		});
		this.tokenId = tokenId;
		this.evmTokenId = evmTokenId;
		this.NiceName = NiceName;
		this.type = [];
		this.Environment = [Environment];
	}

	setType(type) {
		if (this.AllowedTypes[type]) {
			this.type.push(this.AllowedTypes[type]);
		}
		else {
			throw new Error(`Invalid type: ${type}. Allowed types are: ${this.AllowedTypes}`);
		}
	}

	// define a toString()
	toString() {
		return `EligibleNft: ${this.tokenId}, ${this.evmTokenId}, ${this.NiceName}, ${this.type}, ${this.Environment}`;
	}

	toObject() {
		return {
			tokenId: this.tokenId,
			evmTokenId: this.evmTokenId,
			NiceName: this.NiceName,
			type: this.type,
			Environment: this.Environment,
		};
	}
}

function isValidCID(cid) {
	// CIDv0 (Base58) and CIDv1 (Base32) pattern
	const cidPattern = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[0-9A-Za-z]{58})$/;
	return cidPattern.test(cid);
}

async function checkCIDExists(_cid) {
	if (!_cid || !isValidCID(_cid)) {
		return false;
	}
	// check if the cid exists in the cidMap
	if (!cidMap.has(_cid)) {
		console.log('Filtering for', _cid, 'in', 'cidDB');
		const data = await client.request(readItems('cidDB', {
			filter: {
				cid: {
					_eq: _cid,
				},
			},
		}));

		if (data.length == 0) {
			return false;
		}
		else {
			cidMap.set(_cid, true);
			return true;
		}
	}

	return cidMap.get(_cid);
}

async function checkCIDsMissing(cidList) {
	const missingCIDs = [];
	const data = await client.request(readItems('cidDB', {
		filter: {
			cid: {
				_in: cidList,
			},
		},
	}));

	const cidSet = new Set(data.map((item) => item.cid));

	for (const cid of cidList) {
		if (!cidSet.has(cid)) {
			missingCIDs.push(cid);
		}
	}

	return missingCIDs;
}

async function writeCIDData(cidList) {
	// check if CID already exists
	cidList = await checkCIDsMissing(cidList);
	// check all items are valid CIDs / filter out the dud ones
	cidList = cidList.filter((cid) => isValidCID(cid));
	if (cidList.length == 0) {
		return;
	}
	else {
		// write to directus
		// create a new client with the static token
		console.log('Writing CID:', cidList.length, 'items');
	}
	const writeClient = createDirectus(process.env.DIRECTUS_DB_URL).with(staticToken(process.env.DIRECTUS_TOKEN)).with(rest());
	try {

		const data = await writeClient.request(createItems('cidDB', cidList.map((cid) => { return { cid: cid }; })));
		console.log(data.length, 'items created');
	}
	catch (error) {
		console.log('Error writing CID data', error);
	}
}

async function pinIPFS(_cid, _name, _image = false, skipDB = false) {
	const isPinLive = await checkPinHttp(_cid);
	if (isPinLive >= 200 && isPinLive < 300) {
		console.log('CID already pinned:', LSH_IPFS_GATEWAY + _cid);
		if (!await checkCIDExists(_cid)) {
			await writeCIDData([_cid]).then().catch((error) => {
				throw new Error(`Error writing CID ${_cid} to database [${error}]`);
			});
		}

		confirmPin(_cid);
	}
	else {

		const metadataPin = {
			cid: _cid,
			name: _name,
			meta: {
				image: _image,
			},
		};

		console.log('Pinning', metadataPin);

		await axios.post(filebasePinningService, metadataPin, {
			headers: {
				Authorization: `Bearer ${filebasePinningApiKey}`,
			},
			validateStatus: () => true,
		}).then((response) => console.log('metadata pin response:', response?.status, response.data)).catch((error) => {
			throw new Error(`Error pinning CID ${_cid} - ${_name} [${error}]`);
		});
	}

	// write the CID to the database
	if (!skipDB) {
		await writeCIDData([_cid]).catch((error) => {
			throw new Error(`Error writing CID ${_cid} to database [${error}]`);
		});
	}

	return true;
}

async function confirmPin(_cid, forcePin = false) {
	if (!isValidCID(_cid)) {
		return false;
	}

	const response = await checkPinStatus(_cid);
	let pinned = false;

	if (response && response?.length > 0 && response[0]?.status == 'pinned') {
		const writeClient = createDirectus(process.env.DIRECTUS_DB_URL).with(staticToken(process.env.DIRECTUS_TOKEN)).with(rest());
		const data = await writeClient.request(updateItem('cidDB', _cid, { pin_confirmed: true }));
		logger.info('Pin confirmed', { cid: _cid, requestid: response[0]?.requestid });
		pinned = true;
	}

	if (forcePin && !pinned && isValidCID(_cid)) {
		await pinIPFS(_cid, 'Forced Pin', false, true);
		pinned = true;
	}

	return pinned;
}

function isValidArweaveCID(cid) {
	// Arweave CID pattern
	const cidPattern = /^[a-zA-Z0-9_-]{43}$/;
	return cidPattern.test(cid);
}

async function getUnconfirmedPins() {
	// query directus for unconfirmed pins
	console.log('Getting unconfirmed pins');
	let page = 0;
	const unconfirmedPins = [];
	do {
		const data = await client.request(readItems('cidDB', {
			filter: {
				pin_confirmed: {
					_eq: false,
				},
			},
			page: page,
		}));
		unconfirmedPins.push(...data);
		if (data.length == 0) {
			page = 0;
			break;
		}
		page++;
	} while (page > 0);

	return unconfirmedPins;
}

process.on('exit', () => {
	saveCIDCache().catch(err => console.error('Error saving CID cache:', err));
});

process.on('SIGINT', () => {
	saveCIDCache().then(() => process.exit(0));
});

module.exports = { getStaticData, TokenStaticData, writeStaticData, getPost, deleteAddress, getStaticDataToken, getEligibleNfts, EligibleNft, writeEligibleNfts, isValidCID, checkCIDExists, writeCIDData, pinIPFS, getUnconfirmedPins, confirmPin, checkCIDsMissing, checkPinStatus, isValidArweaveCID, loadCIDCache, saveCIDCache, preloadCIDCacheFromDB, getCIDCacheSize, clearCIDCache };