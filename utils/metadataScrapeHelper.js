const fetch = require('cross-fetch');
const { TokenStaticData, writeStaticData, getStaticDataToken, isValidCID, checkCIDExists, writeCIDData, pinIPFS, isValidArweaveCID } = require('./tokenStaticDataHelper');
const { getBaseURL } = require('./hederaMirrorHelpers');

const maxRetries = 18;
const ipfsGateways = ['https://cloudflare-ipfs.com/ipfs/', 'https://ipfs.eth.aragon.network/ipfs/', 'https://ipfs.io/ipfs/', 'https://ipfs.eternum.io/ipfs/', 'https://cloudflare-ipfs.com/ipfs/', 'dweb'];
const arweaveGateways = ['https://arweave.net/', 'https://ar-io.dev/', 'https://permagate.io/', 'https://arweave.developerdao.com/'];
let totalCompleted = 0;
let totalToProcess = 0;
const errorSerials = [];

const envMap = new Map();
envMap['MAIN'] = 'mainnet';
envMap['TEST'] = 'testnet';

async function getStaticDataViaMirrors(env, tokenId, collection, allTokenSerials = null, routeUrl = null) {

	// get the existing data
	if (!allTokenSerials) allTokenSerials = await getStaticDataToken(tokenId);

	console.log('Existing data:', allTokenSerials.length);

	const baseUrl = getBaseURL(env);

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
	await Promise.all(nfts.map((nft) => processNFT(nft, tokenId, collection, allTokenSerials, envMap[env]))).then(token => {
		// strip token of undefined
		tokenStaticDataList.push(token.filter((item) => item != undefined && !allTokenSerials.includes(item.serial)));

		console.log(`Processed: ${totalCompleted} errors: ${errorSerials.length} (${errorSerials})`);
		if (totalCompleted == totalToProcess) {
			console.log('**COMPLETE**');
		}
	}).then(() => {
		const objList = tokenStaticDataList.flat().map((item) => item.toObject());
		console.log('Writing', objList.length, 'items');
		writeStaticData(objList, allTokenSerials).catch((error) => {
			console.error('error writing', error, objList[0], 'to', objList[objList.length - 1]);
		});
	}).catch((error) => {
		console.error(error);
	});
	routeUrl = json.links.next;
	if	(routeUrl) {
		await sleep(100);
		await getStaticDataViaMirrors(env, tokenId, collection, allTokenSerials, routeUrl);
	}
}

async function processNFT(nft, tokenId, collection, allTokenSerials, env) {

	const serialNum = nft.serial_number;

	const deleted = nft.deleted;
	if (deleted) {
		console.log(serialNum, 'is deleted - skipping');
		return;
	}
	else if (allTokenSerials.includes(serialNum)) {
		console.log(serialNum, 'already exists - skipping');
		return;
	}
	else {
		console.log(serialNum, 'is not in the DB - processing');
	}

	await sleep(21 * serialNum % 1000 + 100);

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
		env,
	);

	// check if metadataCid is in the DB
	const metadataCID = extractCIDFromUrl(metadataString);
	if (!await checkCIDExists(metadataCID) && isValidCID(metadataCID)) {
		console.log('pinning:', metadataCID);
		// let's pin it
		const status = await pinIPFS(metadataCID, `${tokenId} - ${collection} - ${serialNum}-meta`, false);
		if (!status) {
			errorSerials.push(serialNum);
			console.log('**Error pinning:', serialNum);
		}
	}

	// check if the CID is in the DB
	const imageCID = extractCIDFromUrl(metadataJSON.image);
	if (!await checkCIDExists(imageCID) && isValidCID(imageCID)) {
		// let's pin it
		const status = await pinIPFS(imageCID, `${tokenId} - ${collection}- ${serialNum}-img`, true);
		if (!status) {
			errorSerials.push(serialNum);
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
		return url;
	}
	// remove the ipfs:// prefix and anything after the CID
	const cleanIPFS = url.replace(/^ipfs:\/\/|https:\/\/ipfs\.infura\.io\/ipfs\/|https:\/\/cloudflare-ipfs\.com\/ipfs\//, '');
	return cleanIPFS.split('/')[0];
}

async function fetchIPFSJson(ifpsUrl, depth = 0, seed = 0) {
	if (depth >= maxRetries) {
		// if CID is valid and not in the DB, try to pin as we fail.
		let metadataCID = extractCIDFromUrl(ifpsUrl);
		if (metadataCID.includes('/')) {
			metadataCID = metadataCID.split('/')[0];
		}
		console.log('Bailing on:', metadataCID, 'from', ifpsUrl);
		if (!await checkCIDExists(metadataCID) && isValidCID(metadataCID)) {
			const status = await pinIPFS(metadataCID, `${ifpsUrl}-failed-load`, false);
			if (!status) {
				console.log('**Error pinning:', `${ifpsUrl}-failed-load`);
			}
		}
		return null;
	}
	depth = depth + 1;

	const metadataCID = extractCIDFromUrl(ifpsUrl);

	let url;
	if (isValidArweaveCID(metadataCID)) {
		url = `${arweaveGateways[seed % arweaveGateways.length]}${metadataCID}`;
	}
	else if (isValidCID(metadataCID) && await checkCIDExists(metadataCID)) {
		url = `https://lazysuperheroes.myfilebase.com/ipfs/${ifpsUrl}`;
		// function checks for existing CID and writes to DB if not found
		await writeCIDData(metadataCID);
	}
	else if (ifpsUrl.includes('hcs://')) {
		// split on the hcs://1/0.0.XXXX and take the last part to append to https://tier.bot/api/hashinals-cdn/ plus ?network=
		const hcsSplit = ifpsUrl.split('/');
		const hcsTopicId = hcsSplit[hcsSplit.length - 1];
		url = `https://tier.bot/api/hashinals-cdn/${hcsTopicId}?network=mainnet`;
	}
	else {
		// remove the ipfs:// prefix and anything after the CID

		const ipfsHash = ifpsUrl.replace(/^ipfs:\/\/|https:\/\/ipfs\.infura\.io\/ipfs\/|https:\/\/cloudflare-ipfs\.com\/ipfs\//, '');
		const [hash, ...path] = ipfsHash.split('/');
		if (ipfsGateways[seed % ipfsGateways.length] == 'dweb') {
			url = `https://${hash}.ipfs.dweb.link/${path.join('/')}`;
		}
		else {
			url = `${ipfsGateways[seed % ipfsGateways.length]}${ifpsUrl}`;
		}
	}

	if (depth > 15) console.log('Attempt: ', depth, url);


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
	catch {
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