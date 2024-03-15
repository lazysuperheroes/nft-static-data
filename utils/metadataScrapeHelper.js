const fetch = require('cross-fetch');
const { TokenStaticData, writeStaticData } = require('./tokenStaticDataHelper');

const maxRetries = 20;
const ipfsGateways = ['https://cloudflare-ipfs.com/ipfs/', 'https://ipfs.eth.aragon.network/ipfs/', 'https://ipfs.io/ipfs/', 'https://ipfs.eternum.io/ipfs/', 'https://cloudflare-ipfs.com/ipfs/'];
let totalCompleted = 0;
let totalToProcess = 0;
const errorSerials = [];

async function getStaticDataViaMirrors(env, tokenId, collection, routeUrl = null) {

	const baseUrl = env;
	if (!routeUrl) routeUrl = `/api/v1/tokens/${tokenId}/nfts/?limit=100`;

	const json = await fetchJson(baseUrl + routeUrl);
	if (json == null) {
		console.log('FATAL ERROR: no NFTs found', baseUrl + routeUrl);
		// unlikely to get here but a sensible default
		return;
	}
	const nfts = json.nfts;
	totalToProcess = totalToProcess + nfts.length;
	const tokenStaticDataList = [];
	Promise.all(nfts.map((nft) => processNFT(nft, tokenId, collection))).then(token => {
		// should get back a list of TokenStaticData objects
		tokenStaticDataList.push(token);

		console.log(`Processed: ${totalCompleted} errors: ${errorSerials.length} (${errorSerials})`);
		if (totalCompleted == totalToProcess) {
			console.log('**COMPLETE**');
		}
	}).then(() => {
		console.log('Passing for write', tokenStaticDataList.length, 'items');
		const objList = tokenStaticDataList.flat().map((item) => item.toObject());
		writeStaticData(objList).catch((error) => {
			console.error('error writing', error, objList);
		});
	}).catch((error) => {
		console.error(error);
	});
	routeUrl = json.links.next;
	if	(routeUrl) {
		getStaticDataViaMirrors(env, tokenId, collection, routeUrl);
	}
}

async function processNFT(nft, tokenId, collection) {

	const serialNum = nft.serial_number;

	const deleted = nft.deleted;
	if (deleted) {
		console.log(serialNum, 'is deleted - skipping');
		return;
	}

	await sleep(21 * serialNum % 1000);

	const metadataString = atob(nft.metadata);

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
		errorSerials.push(serialNum);
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
	);

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

async function fetchIPFSJson(ifpsUrl, depth = 0, seed = 0) {
	if (depth >= maxRetries) return null;
	if (depth > 15) console.log('Attempt: ', depth);
	depth = depth + 1;

	const url = `${ipfsGateways[seed % ipfsGateways.length]}${ifpsUrl}`;
	seed += 1;
	const sleepTime = ((12 * depth ^ 2 * seed) % 100) * (depth % 5);
	try {
		const res = await fetchWithTimeout(url);
		if (res.status != 200) {
			await sleep(sleepTime);
			return await fetchIPFSJson(ifpsUrl, depth, seed);
		}
		return res.json();

	}
	catch (err) {
		if (depth > 8) {
			await sleep(sleepTime + 225 * depth);
		}
		else {
			await sleep(sleepTime + 30 * depth);
		}
		return await fetchIPFSJson(ifpsUrl, depth, seed);
	}
}

const sleep = (milliseconds) => {
	return new Promise(resolve => setTimeout(resolve, milliseconds));
};

module.exports = { getStaticDataViaMirrors };