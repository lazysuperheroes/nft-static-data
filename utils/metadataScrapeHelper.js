const fetch = require('cross-fetch');
const pLimit = require('p-limit');
const { TokenStaticData, writeStaticData, getStaticDataToken, isValidCID, checkCIDExists, writeCIDData, pinIPFS, isValidArweaveCID } = require('./tokenStaticDataHelper');
const { getBaseURL } = require('./hederaMirrorHelpers');
const ProcessingContext = require('./ProcessingContext');
const { NormalizedMetadata } = require('./schemaWriter');
const config = require('../config');
const logger = require('./logger');

const limit = pLimit(config.processing.concurrentRequests);
const maxRetries = config.processing.maxRetries;

/**
 * Main entry point for scraping NFT metadata from mirror nodes
 *
 * @param {string} env - Environment (MAIN, TEST, PREVIEW)
 * @param {string} tokenId - Token ID to scrape
 * @param {string} collection - Collection name for database
 * @param {number[]|null} allTokenSerials - Existing serials to skip (or null to fetch)
 * @param {string|null} routeUrl - Pagination URL (internal use)
 * @param {boolean} dryRun - If true, simulate without writing
 * @param {Function|null} progressCallback - Progress callback function
 * @param {ProcessingContext|null} ctx - Processing context (created internally if null)
 * @returns {Promise<ProcessingContext>} The processing context with results
 */
async function getStaticDataViaMirrors(env, tokenId, collection, allTokenSerials = null, routeUrl = null, dryRun = false, progressCallback = null, ctx = null) {

	// Create or initialize context on first call (non-recursive)
	const isFirstCall = !routeUrl;
	if (isFirstCall) {
		ctx = new ProcessingContext({
			tokenId,
			collection,
			environment: env,
			dryRun,
			progressCallback,
		});
		ctx.start();
	}

	if (!allTokenSerials) {
		// Use schema writer for normalized mode, legacy function for TokenStaticData
		if (ctx.isNormalizedMode()) {
			const writer = ctx.getSchemaWriter();
			allTokenSerials = await writer.getExistingSerials(tokenId);
		}
		else {
			allTokenSerials = await getStaticDataToken(tokenId);
		}
	}

	const baseUrl = getBaseURL(env);

	if (isFirstCall) {
		routeUrl = `/api/v1/tokens/${tokenId}/nfts/?limit=100`;
		console.log('Existing data:', allTokenSerials.length);
		logger.info('Starting metadata scrape', { tokenId, collection, existingCount: allTokenSerials.length });
	}

	const json = await fetchJson(baseUrl + routeUrl, 0, ctx);
	if (json == null) {
		console.log('FATAL ERROR: no NFTs found', baseUrl + routeUrl);
		logger.error('No NFTs found', { url: baseUrl + routeUrl });
		return ctx;
	}
	const nfts = json.nfts;

	const nftsToProcess = nfts.filter(nft => !nft.deleted && !allTokenSerials.includes(nft.serial_number));
	ctx.addToProcess(nftsToProcess.length);

	if (ctx.actualTotal === 0) {
		const { getTokenDetails } = require('./hederaMirrorHelpers');
		const tokenData = await getTokenDetails(env, tokenId);
		const tokenTotalSupply = parseInt(tokenData.total_supply) || 0;
		ctx.setActualTotal(tokenTotalSupply - allTokenSerials.length);

		if (ctx.progressCallback && ctx.actualTotal > 0) {
			ctx.progressCallback(0, ctx.actualTotal, 0);
		}
	}

	const tokenStaticDataList = [];

	const promises = nfts.map((nft) => limit(() => processNFT(nft, tokenId, collection, allTokenSerials, ctx)));

	await Promise.all(promises).then(token => {
		tokenStaticDataList.push(token.filter((item) => item != undefined && !allTokenSerials.includes(item.serial)));

		if (nftsToProcess.length > 0) {
			const recentErrors = ctx.errorSerials.slice(-5).map(e => typeof e === 'string' ? e : e.serial);
			console.log(`Processed: ${ctx.totalCompleted}/${ctx.actualTotal} errors: ${ctx.errorSerials.length} ${ctx.errorSerials.length > 0 ? '(' + recentErrors.join(', ') + ')' : ''}`);
			logger.info('Batch processed', { completed: ctx.totalCompleted, total: ctx.actualTotal, errors: ctx.errorSerials.length });

			ctx.reportProgress();
		}

		if (ctx.isComplete()) {
			console.log('**COMPLETE**');
			logger.info('Processing complete', { total: ctx.totalCompleted, errors: ctx.errorSerials.length });
			ctx.printStats();
		}
	}).then(async () => {
		const flatList = tokenStaticDataList.flat();
		console.log('Writing', flatList.length, 'items');

		if (ctx.isNormalizedMode()) {
			// Use schema writer for normalized mode
			const writer = ctx.getSchemaWriter();
			await writer.writeMetadata(flatList, allTokenSerials, dryRun).catch((error) => {
				console.error('error writing', error);
				logger.error('Failed to write batch', { error: error.message, count: flatList.length });
			});
		}
		else {
			// Legacy TokenStaticData format
			const objList = flatList.map((item) => item.toObject());
			await writeStaticData(objList, allTokenSerials, dryRun).catch((error) => {
				console.error('error writing', error, objList[0], 'to', objList[objList.length - 1]);
				logger.error('Failed to write batch', { error: error.message, count: objList.length });
			});
		}
	}).catch((error) => {
		console.error(error);
		logger.error('Error processing batch', { error: error.message });
	});

	routeUrl = json.links.next;
	if (routeUrl) {
		await sleep(100);
		await getStaticDataViaMirrors(env, tokenId, collection, allTokenSerials, routeUrl, dryRun, progressCallback, ctx);
	}
	else if (isFirstCall && ctx.totalCompleted === 0 && ctx.actualTotal === 0) {
		console.log('All NFTs already exist in database - nothing to process');
		logger.info('No new NFTs to process', { tokenId, existingCount: allTokenSerials.length });
	}

	// Complete context on final call
	if (isFirstCall) {
		ctx.complete();
	}

	return ctx;
}

/**
 * Process a single NFT
 *
 * @param {Object} nft - NFT data from mirror node
 * @param {string} tokenId - Token ID
 * @param {string} collection - Collection name
 * @param {number[]} allTokenSerials - Existing serials to skip
 * @param {ProcessingContext} ctx - Processing context
 * @returns {Promise<TokenStaticData|NormalizedMetadata|undefined>}
 */
async function processNFT(nft, tokenId, collection, allTokenSerials, ctx) {

	const serialNum = nft.serial_number;
	const env = ctx.getMappedEnv(ctx.environment);

	const deleted = nft.deleted;
	if (deleted) {
		ctx.incrementCompleted();
		return;
	}
	else if (allTokenSerials.includes(serialNum)) {
		ctx.incrementCompleted();
		return;
	}

	const metadataString = Buffer.from(nft.metadata, 'base64').toString('utf-8');

	const ipfsRegEx = /ipfs:?\/\/?(.+)/i;
	let ipfsString;
	try {
		ipfsString = metadataString.match(ipfsRegEx)[1];
	}
	catch (_err) {
		ipfsString = metadataString;
	}

	const metadataJSON = await fetchIPFSJson(ipfsString, 0, serialNum, ctx);

	if (metadataJSON == null) {
		ctx.recordCategorizedError('fetchMetadata', {
			serial: serialNum,
			tokenId,
			cid: extractCIDFromUrl(metadataString),
			message: 'Failed to fetch metadata JSON after max retries',
		});
		console.log('**Error processing:', serialNum);
		return;
	}

	const attribs = metadataJSON.attributes;

	// check if metadataCid is in the DB
	const metadataCID = extractCIDFromUrl(metadataString);
	if (!await checkCIDExists(metadataCID) && isValidCID(metadataCID)) {
		console.log('pinning:', metadataCID);
		// let's pin it
		const status = await pinIPFS(metadataCID, `${tokenId} - ${collection} - ${serialNum}-meta`, false);
		if (!status) {
			ctx.recordCategorizedError('pinMetadata', {
				serial: serialNum,
				tokenId,
				cid: metadataCID,
				message: 'Failed to pin metadata CID',
			});
			console.log('**Error pinning:', serialNum);
		}
	}

	// check if the CID is in the DB
	const imageCID = extractCIDFromUrl(metadataJSON.image);
	if (!await checkCIDExists(imageCID) && isValidCID(imageCID)) {
		// let's pin it
		const status = await pinIPFS(imageCID, `${tokenId} - ${collection}- ${serialNum}-img`, true);
		if (!status) {
			ctx.recordCategorizedError('pinImage', {
				serial: serialNum,
				tokenId,
				cid: imageCID,
				message: 'Failed to pin image CID',
			});
			console.log('**Error pinning (image):', serialNum);
		}
	}

	ctx.incrementCompleted();
	console.log(`complete: ${serialNum} -> now total complete: ${ctx.totalCompleted}`);

	// Return appropriate format based on schema mode
	if (ctx.isNormalizedMode()) {
		return new NormalizedMetadata({
			tokenId,
			serial: serialNum,
			metadataUrl: metadataString,
			rawMetadata: JSON.stringify(metadataJSON),
			image: metadataJSON.image,
			attributes: attribs ? JSON.stringify(attribs) : null,
			name: metadataJSON.name,
			collection,
			environment: env,
			cid: metadataCID,
			downloadedToFile: false,
			fullyEnriched: true,
		});
	}

	// Legacy TokenStaticData format
	return new TokenStaticData(
		`${tokenId}!${serialNum}`,
		tokenId,
		serialNum,
		metadataString,
		JSON.stringify(metadataJSON),
		metadataJSON.image,
		JSON.stringify(attribs),
		metadataJSON.name,
		collection,
		env,
	);
}

async function fetchWithTimeout(resource, options = {}) {
	const { timeout = config.processing.timeoutMs || 30000 } = options;

	const controller = new AbortController();
	const id = setTimeout(() => controller.abort(), timeout);
	const response = await fetch(resource, {
		...options,
		signal: controller.signal,
	});
	clearTimeout(id);
	return response;
}

/**
 * Fetch JSON from a URL with retry logic
 *
 * @param {string} url - URL to fetch
 * @param {number} depth - Current retry depth
 * @param {ProcessingContext} ctx - Processing context (optional, for config)
 * @returns {Promise<Object|null>}
 */
async function fetchJson(url, depth = 0, ctx = null) {
	const max = ctx?.maxRetries || maxRetries;
	if (depth >= max) return null;
	depth++;
	try {
		const res = await fetchWithTimeout(url);
		if (res.status != 200) {
			await sleep(1000 * depth);
			return await fetchJson(url, depth, ctx);
		}
		return res.json();

	}
	catch (err) {
		await sleep(1000 * depth);
		return await fetchJson(url, depth, ctx);
	}
}

/**
 * Extract CID from URL
 * Supports IPFS (various gateways) and Arweave URLs
 * Returns null for non-IPFS/Arweave URLs to avoid pinning non-IPFS content
 *
 * Supported formats:
 * - IPFS: ipfs://CID, https://gateway/ipfs/CID, CID.ipfs.dweb.link
 * - Arweave: ar://CID, https://arweave.net/CID, https://ar-io.dev/CID, etc.
 * - Direct: bare CID (detected by pattern)
 */
function extractCIDFromUrl(url) {
	if (!url) return null;

	const lowerUrl = url.toLowerCase();

	// Arweave detection: ar:// protocol or known arweave domains
	if (lowerUrl.startsWith('ar://')) {
		// ar://CID or ar://CID/path
		return url.slice(5).split('/')[0];
	}

	// Known Arweave gateways
	const arweaveGatewayPattern = /^https?:\/\/(?:arweave\.net|ar-io\.dev|permagate\.io|arweave\.developerdao\.com)\/(.+)/i;
	const arweaveMatch = url.match(arweaveGatewayPattern);
	if (arweaveMatch) {
		return arweaveMatch[1].split('/')[0];
	}

	// IPFS detection
	if (lowerUrl.startsWith('ipfs://')) {
		// ipfs://CID or ipfs://CID/path
		return url.slice(7).split('/')[0];
	}

	// Generic IPFS gateway pattern: any URL with /ipfs/CID in path
	const ipfsPathPattern = /\/ipfs\/([^/?#]+)/i;
	const ipfsMatch = url.match(ipfsPathPattern);
	if (ipfsMatch) {
		return ipfsMatch[1];
	}

	// Subdomain-style IPFS: CID.ipfs.dweb.link or CID.ipfs.*.com
	const subdomainPattern = /^https?:\/\/([^.]+)\.ipfs\.[^/]+/i;
	const subdomainMatch = url.match(subdomainPattern);
	if (subdomainMatch) {
		return subdomainMatch[1];
	}

	// HCS (Hedera Consensus Service) URLs - not IPFS, return the topic ID
	if (lowerUrl.includes('hcs://')) {
		const hcsParts = url.split('/');
		return hcsParts[hcsParts.length - 1];
	}

	// If no IPFS/Arweave pattern matched, check if it looks like a bare CID
	// CIDv0: Qm followed by 44 base58 chars (46 total)
	// CIDv1: b followed by 58 base32 chars (59 total)
	const firstSegment = url.split('/')[0];
	if (/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(firstSegment) ||
		/^b[a-z2-7]{58}$/i.test(firstSegment)) {
		return firstSegment;
	}

	// Not a recognized IPFS/Arweave URL
	return null;
}

/**
 * Fetch JSON from IPFS/Arweave with gateway rotation and retry
 *
 * @param {string} ipfsUrl - IPFS/Arweave URL
 * @param {number} depth - Current retry depth
 * @param {number} seed - Seed for jitter calculation
 * @param {ProcessingContext} ctx - Processing context
 * @returns {Promise<Object|null>}
 */
async function fetchIPFSJson(ipfsUrl, depth = 0, seed = 0, ctx = null) {
	const startTime = Date.now();
	const ipfsGatewayManager = ctx?.ipfsGatewayManager || new (require('./gatewayManager'))(config.ipfs.gateways, 'ipfs');
	const arweaveGatewayManager = ctx?.arweaveGatewayManager || new (require('./gatewayManager'))(config.arweave.gateways, 'arweave');
	const max = ctx?.maxRetries || maxRetries;

	if (depth >= max) {
		let metadataCID = extractCIDFromUrl(ipfsUrl);
		if (metadataCID && metadataCID.includes('/')) {
			metadataCID = metadataCID.split('/')[0];
		}
		logger.warn('Max retries reached', { cid: metadataCID, url: ipfsUrl });

		if (metadataCID && !await checkCIDExists(metadataCID) && isValidCID(metadataCID)) {
			const status = await pinIPFS(metadataCID, `${ipfsUrl}-failed-load`, false);
			if (!status) {
				logger.error('Failed to pin after max retries', { cid: metadataCID });
			}
		}
		return null;
	}
	depth = depth + 1;

	const metadataCID = extractCIDFromUrl(ipfsUrl);

	let url;
	let gatewayType = null;

	if (isValidArweaveCID(metadataCID)) {
		const arweaveSplit = ipfsUrl.replace(/^ar:\/\/|https:\/\/arweave\.net\//, '');
		const gateway = arweaveGatewayManager.getBestGateway();
		url = `${gateway}${arweaveSplit}`;
		gatewayType = 'arweave';
	}
	else if (isValidCID(metadataCID) && await checkCIDExists(metadataCID)) {
		url = `${config.ipfs.filebaseGateway}${ipfsUrl}`;
		await writeCIDData(metadataCID);
		gatewayType = 'filebase';
	}
	else if (ipfsUrl.includes('hcs://')) {
		const hcsSplit = ipfsUrl.split('/');
		const hcsTopicId = hcsSplit[hcsSplit.length - 1];
		url = `https://tier.bot/api/hashinals-cdn/${hcsTopicId}?network=mainnet`;
		gatewayType = 'hcs';
	}
	else if (!ipfsUrl.toLowerCase().includes('ipfs')) {
		url = ipfsUrl;
		gatewayType = 'direct';
	}
	else {
		const ipfsHash = ipfsUrl.replace(/^ipfs:\/\/|https:\/\/ipfs\.infura\.io\/ipfs\/|https:\/\/cloudflare-ipfs\.com\/ipfs\//, '');
		const [hash, ...path] = ipfsHash.split('/');
		const gateway = ipfsGatewayManager.getBestGateway();

		if (gateway == 'dweb') {
			url = `https://${hash}.ipfs.dweb.link/${path.join('/')}`;
		}
		else {
			url = `${gateway}${ipfsUrl}`;
		}
		gatewayType = 'ipfs';
	}

	seed += 1;
	// Fixed: Use ** for exponentiation instead of ^ (XOR)
	const sleepTime = ((12 * (depth ** 2) * seed) % 100) * (depth % 5);

	try {
		const res = await fetchWithTimeout(url);
		if (res.status != 200) {
			if (gatewayType === 'ipfs') ipfsGatewayManager.recordFailure(url.split('/ipfs/')[0] + '/ipfs/');
			if (gatewayType === 'arweave') arweaveGatewayManager.recordFailure(url.split('/')[0] + '//' + url.split('/')[2] + '/');
			await sleep(sleepTime);
			return await fetchIPFSJson(ipfsUrl, depth, seed, ctx);
		}

		const responseTime = Date.now() - startTime;
		if (gatewayType === 'ipfs') ipfsGatewayManager.recordSuccess(url.split('/ipfs/')[0] + '/ipfs/', responseTime);
		if (gatewayType === 'arweave') arweaveGatewayManager.recordSuccess(url.split('/')[0] + '//' + url.split('/')[2] + '/', responseTime);

		return res.json();
	}
	catch {
		if (depth > 8) {
			await sleep(sleepTime + 225 * depth);
		}
		else {
			await sleep(sleepTime + 30 * depth);
		}
		return await fetchIPFSJson(ipfsUrl, depth, seed, ctx);
	}
}

const sleep = (milliseconds) => {
	return new Promise(resolve => setTimeout(resolve, milliseconds));
};

module.exports = {
	getStaticDataViaMirrors,
	ProcessingContext,
	extractCIDFromUrl,
};
