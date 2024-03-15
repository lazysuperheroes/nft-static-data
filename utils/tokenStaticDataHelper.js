const { createDirectus, staticToken, rest, readItems, createItems } = require('@directus/sdk');
require('dotenv').config();


const client = createDirectus(process.env.DIRECTUS_DB_URL).with(staticToken(process.env.DIRECTUS_TOKEN)).with(rest());


/**
 * Query directus for Static Data
 * @param {*} addess Hedera address as string 0.0.XXX
 * @param {Number[]} serials list of serials
 */
async function getStaticData(addess, serials) {
	const data = await client.request(readItems('TokenStaticData', {
		filter: {
			address: {
				_eq: addess,
			},
			serial: {
				_in: serials,
			},
		},
	}));
	console.log(data);
}

async function writeStaticData(tokenStaticDataList) {
	console.log('Writing', tokenStaticDataList.length, 'items');
	const data = await client.request(createItems('TokenStaticData', tokenStaticDataList));
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

module.exports = { getStaticData, TokenStaticData, writeStaticData };