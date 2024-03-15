const { getStaticDataViaMirrors } = require('./utils/metadataScrapeHelper');
// const { getStaticData } = require('./utils/tokenStaticDataHelper');

async function main() {
	// await getStaticData('0.0.848553', [1]);
	await getStaticDataViaMirrors('0.0.3566850', 'Req NFT A');
}

main().then(() => {
	console.log('Done');
}).catch((error) => {
	console.error(error);
});