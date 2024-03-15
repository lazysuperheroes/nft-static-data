// const { getStaticData } = require('./utils/tokenStaticDataHelper.js');

const { getStatisDataViaMirrors } = require('./utils/metadataScrapeHelper');

async function main() {
	// await getStaticData('0.0.848553', [1]);
	getStatisDataViaMirrors(848553, 'LSH - Gen 2').then((data) => {
		console.log(data);
	}).catch((error) => {
		console.error(error);
	});
}

main().then(() => {
	console.log('Done');
}).catch((error) => {
	console.error(error);
});