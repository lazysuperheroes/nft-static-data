const { getStaticDataViaMirrors } = require('./utils/metadataScrapeHelper');

async function main() {
	await getStaticDataViaMirrors('0.0.848553', 'LSH - Gen 2');
}

main().then(() => {
	console.log('Done');
}).catch((error) => {
	console.error(error);
});