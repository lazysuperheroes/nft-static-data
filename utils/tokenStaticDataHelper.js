const { createDirectus, staticToken, rest, readItems, createItems, deleteItems } = require('@directus/sdk');
require('dotenv').config();


const client = createDirectus(process.env.DIRECTUS_DB_URL).with(rest());

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
			}));
		}
		else {
			data = await client.request(readItems('TokenStaticData', {
				filter: {
					address: {
						_eq: address,
					},
				},
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

	} while (data.length == 100);

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

async function writeStaticData(tokenStaticDataList) {
	if (tokenStaticDataList.length == 0) {
		return;
	}
	else {
		// write to directus
		// create a new client with the static token
		console.log('Writing', tokenStaticDataList.length, 'items');
	}
	const writeClient = createDirectus(process.env.DIRECTUS_DB_URL).with(staticToken(process.env.DIRECTUS_TOKEN)).with(rest());
	const data = await writeClient.request(createItems('TokenStaticData', tokenStaticDataList));
	console.log(data.length, 'items created');
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
	constructor(uid, address, serial, metadata, rawMetadata, image, attributes, nftName, collection) {
		this.uid = uid;
		this.address = address;
		this.serial = serial;
		this.metadata = metadata;
		this.rawMetadata = rawMetadata;
		this.image = image;
		this.attributes = attributes;
		this.nftName = nftName;
		this.collection = collection;
	}

	// define a toString()
	toString() {
		return `TokenStaticData: ${this.uid}, ${this.address}, ${this.serial}, ${this.metadata}, ${this.rawMetadata}, ${this.image}, ${this.attributes}, ${this.nftName}, ${this.collection}`;
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

module.exports = { getStaticData, TokenStaticData, writeStaticData, getPost, deleteAddress, getStaticDataToken, getEligibleNfts, EligibleNft, writeEligibleNfts };