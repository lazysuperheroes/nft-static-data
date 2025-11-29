const { getUnconfirmedPins, confirmPin } = require('./utils/tokenStaticDataHelper');
const { validateEnvironment } = require('./utils/envValidator');
const logger = require('./utils/logger');
const config = require('./config');
const cliProgress = require('cli-progress');
require('dotenv').config();

validateEnvironment();

let force = false;
const BATCH_SIZE = config.ipfs.pinBatchSize;

if (process.argv.includes('-force') || process.argv.includes('--force')) {
	force = true;
	console.log('🔄 Force pin mode enabled');
	logger.info('Force pin mode enabled');
}

getUnconfirmedPins().then(async (data) => {
	console.log(`📌 Total unconfirmed pins: ${data.length}`);
	logger.info('Starting pin validation', { count: data.length, force });

	if (data.length === 0) {
		console.log('✓ No unconfirmed pins found');
		return;
	}

	const progressBar = new cliProgress.SingleBar({
		format: 'Validating |{bar}| {percentage}% | ETA: {eta}s | {value}/{total} pins',
		barCompleteChar: '\u2588',
		barIncompleteChar: '\u2591',
		hideCursor: true,
	});

	progressBar.start(data.length, 0);

	let completed = 0;
	let confirmed = 0;
	let failed = 0;

	for (let i = 0; i < data.length; i += BATCH_SIZE) {
		const batch = data.slice(i, i + BATCH_SIZE);
		await Promise.all(batch.map(async (item) => {
			try {
				const result = await confirmPin(item.cid, force);
				if (result) confirmed++;
			}
			catch (error) {
				failed++;
				logger.error('Pin validation failed', { cid: item.cid, error: error.message });
			}
			completed++;
			progressBar.update(completed);
		}));
	}

	progressBar.stop();

	console.log('\n' + '='.repeat(60));
	console.log('📊 Pin Validation Summary');
	console.log('='.repeat(60));
	console.log(`✓ Confirmed: ${confirmed}`);
	console.log(`✗ Failed: ${failed}`);
	console.log(`📍 Total Processed: ${completed}`);
	console.log('='.repeat(60));

	logger.info('Pin validation complete', { total: completed, confirmed, failed });
}).catch((error) => {
	console.error('❌ Error:', error.message);
	logger.error('Pin validation error', { error: error.message, stack: error.stack });
});