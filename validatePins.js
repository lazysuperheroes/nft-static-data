const { getUnconfirmedPins, confirmPin } = require('./utils/tokenStaticDataHelper');
require('dotenv').config();

let force = false;
const BATCH_SIZE = 20;

// check is -force swicth is there
if (process.argv.includes('-force')) {
	force = true;
	console.log('Force pin mode enabled');
}

getUnconfirmedPins().then(async (data) => {
	// for each pin, call confirmPin
	console.log('Total unconfirmed pins:', data.length);
	for (let i = 0; i < data.length; i += BATCH_SIZE) {
		const batch = data.slice(i, i + BATCH_SIZE);
		await Promise.all(batch.map(async (item) => {
			await confirmPin(item.cid, force);
		}));
	}
}).catch((error) => {
	console.error(error);
});