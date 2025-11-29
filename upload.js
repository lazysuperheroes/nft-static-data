const { getTokenDetails } = require('./utils/hederaMirrorHelpers');
const { getStaticDataViaMirrors } = require('./utils/metadataScrapeHelper');
const { validateEnvironment } = require('./utils/envValidator');
const { validateTokenAddress } = require('./utils/validation');
const logger = require('./utils/logger');
const readlineSync = require('readline-sync');
const cliProgress = require('cli-progress');
const ProgressStateManager = require('./utils/progressState');

require('dotenv').config();

const addressPattern = /^\d\.\d\.\d+$/;
const progressManager = new ProgressStateManager();

let progressBar;

process.on('unhandledRejection', (reason, promise) => {
	console.log('Unhandled Rejection at:', promise, 'reason:', reason);
	logger.error('Unhandled rejection', { reason, promise });
});

async function main() {
	validateEnvironment();

	const args = process.argv.slice(2);

	const dryRun = args.includes('--dry-run') || args.includes('-d');
	const resume = args.includes('--resume') || args.includes('-r');

	const addressArgs = args.filter(arg => !arg.startsWith('--') && !arg.startsWith('-'));

	if (addressArgs.length != 1) {
		console.log('Usage: node upload.js <tokenAddress> [--dry-run] [--resume]');
		console.log('');
		console.log('Options:');
		console.log('  --dry-run, -d    Simulate the upload without making changes');
		console.log('  --resume, -r     Resume from last saved progress');
		return;
	}

	const address = addressArgs[0];

	try {
		validateTokenAddress(address);
	}
	catch (error) {
		console.error('❌', error.message);
		return;
	}

	const values = ['MAIN', 'TEST'];
	const environment = readlineSync.keyInSelect(values, 'Which environment?');

	if (environment === -1) {
		console.log('Cancelled by user');
		return;
	}

	const env = values[environment];

	let savedProgress = null;
	if (resume) {
		savedProgress = await progressManager.loadProgress(address);
		if (savedProgress) {
			const useProgress = readlineSync.keyInYNStrict('Resume from previous progress?');
			if (!useProgress) {
				savedProgress = null;
			}
		}
	}

	const tokenData = await getTokenDetails(env, address);
	logger.info('Token details retrieved', { address, symbol: tokenData.symbol, name: tokenData.name });

	console.log('Default Name:', tokenData.symbol);
	const collection = readlineSync.question('Collection Name for the DB (enter for default): ', { defaultInput: tokenData.symbol });

	console.log('Getting static data for all serials of', address, '(', collection, ') in', env);

	if (dryRun) {
		console.log('🔍 DRY RUN MODE - No changes will be made');
		logger.info('Dry run mode enabled');
	}

	const proceed = readlineSync.keyInYNStrict('Do you want to pull metadata and upload it?');
	if (!proceed) {
		console.log('User Aborted');
		return;
	}

	progressBar = new cliProgress.SingleBar({
		format: 'Progress |{bar}| {percentage}% | ETA: {eta}s | {value}/{total} NFTs | Errors: {errors}',
		barCompleteChar: '\u2588',
		barIncompleteChar: '\u2591',
		hideCursor: true,
	});

	let totalNFTs = 0;
	const progressCallback = (completed, total, errors) => {
		if (totalNFTs === 0 && total > 0) {
			totalNFTs = total;
			progressBar.start(total, completed, { errors });
		}
		else if (total > totalNFTs) {
			totalNFTs = total;
			progressBar.setTotal(total);
		}
		progressBar.update(completed, { errors });

		progressManager.saveProgress(address, {
			completed,
			total,
			errors,
			collection,
			environment: env,
		}).catch(err => logger.error('Failed to save progress', { error: err.message }));
	};

	await getStaticDataViaMirrors(env, address, collection, savedProgress?.serials || null, null, dryRun, progressCallback);

	if (progressBar) {
		progressBar.stop();
	}

	await progressManager.clearProgress(address);
	logger.info('Upload completed', { address, collection });
}

main().then(() => {
	console.log('\n✓ Done');
}).catch((error) => {
	console.error('❌ Error:', error.message);
	logger.error('Main process error', { error: error.message, stack: error.stack });
	if (progressBar) {
		progressBar.stop();
	}
});