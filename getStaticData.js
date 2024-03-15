const { getStaticData } = require('./utils/tokenStaticDataHelper');

async function main() {
	const items = await getStaticData('0.0.848553', [1, 2]);
	console.log('items', items.length);
}

main().then(() => {
	console.log('Done');
}).catch((error) => {
	console.error(error);
});