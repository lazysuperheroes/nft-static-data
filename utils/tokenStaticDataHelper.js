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
	const writeClient = createDirectus(process.env.DIRECTUS_DB_URL).with(staticToken(process.env.DIRECTUS_TOKEN)).with(rest());
	console.log('Writing', tokenStaticDataList.length, 'items');
	const data = await writeClient.request(createItems('TokenStaticData', tokenStaticDataList));
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

module.exports = { getStaticData, TokenStaticData, writeStaticData, getPost, deleteAddress };