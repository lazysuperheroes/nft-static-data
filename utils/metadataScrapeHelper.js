const fetch = require('cross-fetch');
const pLimit = require('p-limit');
const { TokenStaticData, writeStaticData, getStaticDataToken, isValidCID, checkCIDExists, writeCIDData, pinIPFS, isValidArweaveCID } = require('./tokenStaticDataHelper');
const { getBaseURL } = require('./hederaMirrorHelpers');
const GatewayManager = require('./gatewayManager');
const config = require('../config');
const logger = require('./logger');

const limit = pLimit(config.processing.concurrentRequests);

const maxRetries = config.processing.maxRetries;
const ipfsGatewayManager = new GatewayManager(config.ipfs.gateways, 'ipfs');
const arweaveGatewayManager = new GatewayManager(config.arweave.gateways, 'arweave');

let totalCompleted = 0;
let totalToProcess = 0;
let actualTotal = 0;
const errorSerials = [];

const envMap = new Map();
envMap['MAIN'] = 'mainnet';
envMap['TEST'] = 'testnet';

async function getStaticDataViaMirrors(env, tokenId, collection, allTokenSerials = null, routeUrl = null, dryRun = false, progressCallback = null) {

	if (!allTokenSerials) allTokenSerials = await getStaticDataToken(tokenId);

	console.log('Existing data:', allTokenSerials.length);
	logger.info('Starting metadata scrape', { tokenId, collection, existingCount: allTokenSerials.length });

	const baseUrl = getBaseURL(env);

	if (!routeUrl) {
		routeUrl = `/api/v1/tokens/${tokenId}/nfts/?limit=100`;
		totalCompleted = 0;
		totalToProcess = 0;
		actualTotal = 0;
	}

	const json = await fetchJson(baseUrl + routeUrl);
	if (json == null) {
		console.log('FATAL ERROR: no NFTs found', baseUrl + routeUrl);
		logger.error('No NFTs found', { url: baseUrl + routeUrl });
		return;
	}
	const nfts = json.nfts;
	totalToProcess = totalToProcess + nfts.length;

	if (actualTotal === 0 && json.links && json.links.next) {
		const { getTokenDetails } = require('./hederaMirrorHelpers');
		const tokenData = await getTokenDetails(env, tokenId);
		actualTotal = parseInt(tokenData.total_supply) || totalToProcess;
	}
	else if (actualTotal === 0) {
		actualTotal = totalToProcess;
	}

	const tokenStaticDataList = [];

	const promises = nfts.map((nft) => limit(() => processNFT(nft, tokenId, collection, allTokenSerials, envMap[env], dryRun)));

	await Promise.all(promises).then(token => {
		tokenStaticDataList.push(token.filter((item) => item != undefined && !allTokenSerials.includes(item.serial)));

		console.log(`Processed: ${totalCompleted} errors: ${errorSerials.length} ${errorSerials.length > 0 ? '(' + errorSerials.slice(-5).join(', ') + ')' : ''}`);
		logger.info('Batch processed', { completed: totalCompleted, errors: errorSerials.length });

		if (progressCallback) {
			progressCallback(totalCompleted, actualTotal, errorSerials.length);
		}

		if (totalCompleted == totalToProcess) {
			console.log('**COMPLETE**');
			logger.info('Processing complete', { total: totalCompleted, errors: errorSerials.length });
			ipfsGatewayManager.printStats();
			arweaveGatewayManager.printStats();
		}
	}).then(() => {
		const objList = tokenStaticDataList.flat().map((item) => item.toObject());
		console.log('Writing', objList.length, 'items');
		writeStaticData(objList, allTokenSerials, dryRun).catch((error) => {
			console.error('error writing', error, objList[0], 'to', objList[objList.length - 1]);
			logger.error('Failed to write batch', { error: error.message, count: objList.length });
		});
	}).catch((error) => {
		console.error(error);
		logger.error('Error processing batch', { error: error.message });
	});
	routeUrl = json.links.next;
	if (routeUrl) {
		await sleep(100);
		await getStaticDataViaMirrors(env, tokenId, collection, allTokenSerials, routeUrl, dryRun, progressCallback);
	}
}

async function processNFT(nft, tokenId, collection, allTokenSerials, env, dryRun = false) {

	const serialNum = nft.serial_number;

	const deleted = nft.deleted;
	if (deleted) {
		return;
	}
	else if (allTokenSerials.includes(serialNum)) {
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

	const metadataJSON = await fetchIPFSJson(ipfsString, 0, serialNum);

	if (metadataJSON == null) {
		errorSerials.push(`${tokenId}${serialNum}`);
		console.log('**Error processing:', serialNum);
		return;
	}

	const attribs = metadataJSON.attributes;


	const tokenStatic = new TokenStaticData(
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

	// check if metadataCid is in the DB
	const metadataCID = extractCIDFromUrl(metadataString);
	if (!await checkCIDExists(metadataCID) && isValidCID(metadataCID)) {
		console.log('pinning:', metadataCID);
		// let's pin it
		const status = await pinIPFS(metadataCID, `${tokenId} - ${collection} - ${serialNum}-meta`, false);
		if (!status) {
			errorSerials.push(`${tokenId}${serialNum}`);
			console.log('**Error pinning:', serialNum);
		}
	}

	// check if the CID is in the DB
	const imageCID = extractCIDFromUrl(metadataJSON.image);
	if (!await checkCIDExists(imageCID) && isValidCID(imageCID)) {
		// let's pin it
		const status = await pinIPFS(imageCID, `${tokenId} - ${collection}- ${serialNum}-img`, true);
		if (!status) {
			errorSerials.push(`${tokenId}${serialNum}`);
			console.log('**Error pinning (image):', serialNum);
		}
	}

	totalCompleted++;
	console.log(`complete: ${serialNum} -> now total complete: ${totalCompleted}`);
	return tokenStatic;
}

async function fetchWithTimeout(resource, options = {}) {
	const { timeout = 30000 } = options;

	const controller = new AbortController();
	const id = setTimeout(() => controller.abort(), timeout);
	const response = await fetch(resource, {
		...options,
		signal: controller.signal,
	});
	clearTimeout(id);
	return response;
}

async function fetchJson(url, depth = 0) {
	if (depth >= maxRetries) return null;
	depth++;
	try {
		const res = await fetchWithTimeout(url);
		if (res.status != 200) {
			await sleep(1000 * depth);
			return await fetchJson(url, depth);
		}
		return res.json();

	}
	catch (err) {
		await sleep(1000 * depth);
		return await fetchJson(url, depth);
	}
}

//*
// Extract CID from URL
// If not a valid IPFS link (i.e. hosted on Arweave or AWS) return null
// To avoid trying to pin it to IPFS
//*
function extractCIDFromUrl(url) {
	if (url.toLowerCase().includes('ar://') || url.toLowerCase().includes('arweave')) {
		const cleanURL = url.replace(/^ar:\/\/|https:\/\/arweave\.net\//, '');
		return cleanURL.split('/')[0];
	}

	if (!url.toLowerCase().includes('ipfs')) {
		return url.split('/')[0];
	}
	// remove the ipfs:// prefix and anything after the CID
	const cleanIPFS = url.replace(/^ipfs:\/\/|https:\/\/ipfs\.infura\.io\/ipfs\/|https:\/\/cloudflare-ipfs\.com\/ipfs\//, '');
	return cleanIPFS.split('/')[0];
}

async function fetchIPFSJson(ipfsUrl, depth = 0, seed = 0) {
	const startTime = Date.now();

	if (depth >= maxRetries) {
		let metadataCID = extractCIDFromUrl(ipfsUrl);
		if (metadataCID.includes('/')) {
			metadataCID = metadataCID.split('/')[0];
		}
		logger.warn('Max retries reached', { cid: metadataCID, url: ipfsUrl });

		if (!await checkCIDExists(metadataCID) && isValidCID(metadataCID)) {
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
	const sleepTime = ((12 * depth ^ 2 * seed) % 100) * (depth % 5);

	try {
		const res = await fetchWithTimeout(url);
		if (res.status != 200) {
			if (gatewayType === 'ipfs') ipfsGatewayManager.recordFailure(url.split('/ipfs/')[0] + '/ipfs/');
			if (gatewayType === 'arweave') arweaveGatewayManager.recordFailure(url.split('/')[0] + '//' + url.split('/')[2] + '/');
			await sleep(sleepTime);
			return await fetchIPFSJson(ipfsUrl, depth, seed);
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
		return await fetchIPFSJson(ipfsUrl, depth, seed);
	}
}

const sleep = (milliseconds) => {
	return new Promise(resolve => setTimeout(resolve, milliseconds));
};

module.exports = { getStaticDataViaMirrors };