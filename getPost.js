const { getPost } = require('./utils/tokenStaticDataHelper');

async function main() {
	await getPost();
}

main().then(() => {
	console.log('Done');
}).catch((error) => {
	console.error(error);
});