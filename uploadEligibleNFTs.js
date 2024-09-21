const readlineSync = require('readline-sync');
const { getEligibleNfts, EligibleNft, writeEligibleNfts } = require('./utils/tokenStaticDataHelper');
const { TokenId } = require('@hashgraph/sdk');
const { getTokenDetails } = require('./utils/hederaMirrorHelpers');

const addressPattern = /^\d+\.\d+\.\d+$/;

async function main() {
	// expect 2 args
	const args = process.argv.slice(2);
	if (args.length != 1) {
		console.log('usage: node uploadEligibleNFTs.js <tokenAddress>');
		console.log('    where <tokenAddress> is a , separated list of addresses to mark as eligible');
		return;
	}

	const addresses = args[0].split(',');

	for (const address of addresses) {
		// check if address is valid
		if (!addressPattern.test(address)) {
			console.log('Invalid address', address);
			return;
		}
	}

	// use readline to choose the environment (MAIN/TEST)
	const values = ['mainnet', 'testnet', 'previewnet'];
	const environment = readlineSync.keyInSelect(values, 'Which environment?');

	const env = values[environment];

	// get the already eligible NFTs for the environment
	const eligibleNfts = await getEligibleNfts(env);

	console.log('Found', eligibleNfts.length, 'eligible NFTs in', env, eligibleNfts);

	// filter out the addresses that are already eligible
	const newAddresses = addresses.filter((address) => !eligibleNfts.some((nft) => nft.address === address));

	if (newAddresses.length === 0) {
		console.log('No new addresses to add');
		return;
	}

	console.log('Adding', newAddresses.length, 'new addresses to the eligible list');

	// create a list of Eligible NFTs to add
	const eligibleNftsToAdd = [];

	for (const address of newAddresses) {
		// strip net off the end of the env
		const envName = env.substring(0, env.length - 3);
		const tokenDetails = await getTokenDetails(envName, address);

		console.log('Adding', address, tokenDetails.name, tokenDetails.symbol, 'to eligible list');

		const nft = new EligibleNft(
			address,
			TokenId.fromString(address).toSolidityAddress(),
			tokenDetails.name,
			env,
		);

		// ask the user to select the appropriate types from nft.AllowedTypes
		const allowedTypes = Object.keys(nft.AllowedTypes);


		let keepGoing = true;
		while (keepGoing) {
			const selectedTypes = readlineSync.keyInSelect(allowedTypes, 'Select the allowed types for this NFT', { cancel: 'FINISHED' });

			if (selectedTypes == -1) {
				keepGoing = false;
			}
			else {
				nft.setType(allowedTypes[selectedTypes]);
			}
		}
		eligibleNftsToAdd.push(nft);

	}

	// write the new eligible NFTs to the database
	console.log('Adding', eligibleNftsToAdd.length, 'new eligible NFTs');
	const objList = eligibleNftsToAdd.map((item) => item.toObject());
	await writeEligibleNfts(objList).catch((error) => {
		console.error('error writing', error, objList);
	});
}


main().then(() => {
	console.log('Done');
}).catch((error) => {
	console.error(error);
});
