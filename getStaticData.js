const { getStaticData } = require('./utils/tokenStaticDataHelper');

async function main() {
	await getStaticData('0.0.848553', [1]);
}

main().then(() => {
	console.log('Done');
}).catch((error) => {
	console.error(error);
});