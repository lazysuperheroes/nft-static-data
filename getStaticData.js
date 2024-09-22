const { getStaticData } = require('./utils/tokenStaticDataHelper');

// regex pattern for an address number.number.number
const addressPattern = /^\d+\.\d+\.\d+$/;

async function main() {
	// get the token and serials list separated by commas as arguments
	const args = process.argv.slice(2);

	if (args.length != 2) {
		console.log('usage: node getStaticData.js <tokenAddress> <serials>');
		console.log('    where <tokenAddress> is the token address and <serials> is a , separated list of serials');
		return;
	}

	const address = args[0];
	const serials = args[1].split(',').map((serial) => parseInt(serial));

	// check if address is valid
	if (!addressPattern.test(address)) {
		console.log('Invalid address');
		return;
	}

	const items = await getStaticData(address, serials);
	console.log('items', items.length);
	console.dir(items);
}

main().then(() => {
	console.log('Done');
}).catch((error) => {
	console.error(error);
});