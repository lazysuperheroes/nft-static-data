const { getTokenDetails } = require('./utils/hederaMirrorHelpers');
const { getStaticDataViaMirrors } = require('./utils/metadataScrapeHelper');
const readlineSync = require('readline-sync');

// regex pattern for an address number.number.number
const addressPattern = /^\d\.\d\.\d+$/;

process.on('unhandledRejection', (reason, promise) => {
	console.log('Unhandled Rejection at:', promise, 'reason:', reason);
});


async function main() {
	// expect 2 args
	const args = process.argv.slice(2);
	if (args.length != 1) {
		console.log('Please provide a list of token address separated by commas');
		return;
	}

	// use readline to choose the environment (MAIN/TEST)
	const values = ['MAIN', 'TEST'];
	const environment = readlineSync.keyInSelect(values, 'Which environment?');

	const env = values[environment];

	console.log('Environment:', env);

	const interactiveMode = readlineSync.keyInYNStrict('Do you want to use interactive mode?');


	const addressList = args[0].split(',');

	for (const address of addressList) {
		// check if address is valid
		if (!addressPattern.test(address)) {
			console.log('Invalid address', address);
			continue;
		}

		// get the collection name from the mirror node
		const tokenData = await getTokenDetails(env, address);

		console.log('Using Default Name:', tokenData.symbol, 'for', address);

		let collection;
		if (!interactiveMode) {
			collection = tokenData.symbol;
		}
		else {
			collection = readlineSync.question('Collection Name for the DB (enter for default): ', { defaultInput: tokenData.symbol });
		}

		console.log('Getting static data for all serials of', address, '(', collection, ') in', env);

		if (interactiveMode) {
			const proceed = readlineSync.keyInYNStrict('Do you want to pull metadata and upload it?');
			if (!proceed) {
				console.log('User Aborted');
				return;
			}
		}

		await getStaticDataViaMirrors(env, address, collection);
	}
}

main().then(() => {
	console.log('Done');
}).catch((error) => {
	console.error(error);
});