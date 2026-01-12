const { getTokenDetails } = require('./utils/hederaMirrorHelpers');
const { getStaticDataViaMirrors } = require('./utils/metadataScrapeHelper');
const { validateEnvironment } = require('./utils/envValidator');
const { validateTokenAddresses } = require('./utils/validation');
const { preloadCIDCacheFromDB } = require('./utils/tokenStaticDataHelper');
const logger = require('./utils/logger');
const readlineSync = require('readline-sync');
const cliProgress = require('cli-progress');

require('dotenv').config();

const addressPattern = /^\d\.\d\.\d+$/;

let progressBar;

process.on('unhandledRejection', (reason, promise) => {
	console.log('Unhandled Rejection at:', promise, 'reason:', reason);
	logger.error('Unhandled rejection', { reason, promise });
});

async function main() {
	await validateEnvironment();

	const args = process.argv.slice(2);

	const dryRun = args.includes('--dry-run') || args.includes('-d');
	const addressArgs = args.filter(arg => !arg.startsWith('--') && !arg.startsWith('-'));

	if (addressArgs.length != 1) {
		console.log('Usage: node bulkUpload.js <address1>,<address2>,<address3> [--dry-run]');
		console.log('');
		console.log('Options:');
		console.log('  --dry-run, -d    Simulate the upload without making changes');
		return;
	}

	const values = ['MAIN', 'TEST'];
	const environment = readlineSync.keyInSelect(values, 'Which environment?');

	if (environment === -1) {
		console.log('Cancelled by user');
		return;
	}

	const env = values[environment];

	console.log('Environment:', env);

	if (dryRun) {
		console.log('🔍 DRY RUN MODE - No changes will be made');
		logger.info('Dry run mode enabled');
	}

	const interactiveMode = readlineSync.keyInYNStrict('Do you want to use interactive mode?');

	const addressList = addressArgs[0].split(',');

	const validation = validateTokenAddresses(addressList);

	if (validation.invalid.length > 0) {
		console.error('❌ Invalid addresses found:');
		validation.invalid.forEach(({ address, error }) => {
			console.error(`   ${address}: ${error}`);
		});
		const continueAnyway = readlineSync.keyInYNStrict('Continue with valid addresses only?');
		if (!continueAnyway) {
			return;
		}
	}

	console.log(`Processing ${validation.valid.length} valid addresses`);
	logger.info('Starting bulk upload', { count: validation.valid.length, dryRun });

	// Preload CID cache from database to reduce lookups
	await preloadCIDCacheFromDB();

	for (let i = 0; i < validation.valid.length; i++) {
		const address = validation.valid[i];
		console.log(`\n${'='.repeat(80)}`);
		console.log(`Processing ${i + 1}/${validation.valid.length}: ${address}`);
		console.log('='.repeat(80));

		const tokenData = await getTokenDetails(env, address);
		logger.info('Token details retrieved', { address, symbol: tokenData.symbol });

		console.log('Using Default Name:', tokenData.symbol, 'for', address);

		let collection;
		if (!interactiveMode) {
			collection = tokenData.symbol;
		}
		else {
			collection = readlineSync.question('Collection Name for the DB (enter for default): ', { defaultInput: tokenData.symbol });
		}

		console.log('Getting static data for all serials of', address, '(', collection, ') in', env);

		if (interactiveMode) {
			const proceed = readlineSync.keyInYNStrict('Do you want to pull metadata and upload it?');
			if (!proceed) {
				console.log('Skipped by user');
				logger.info('Collection skipped by user', { address });
				continue;
			}
		}

		progressBar = new cliProgress.SingleBar({
			format: `[${address}] |{bar}| {percentage}% | ETA: {eta}s | {value}/{total} | Errors: {errors}`,
			barCompleteChar: '\u2588',
			barIncompleteChar: '\u2591',
			hideCursor: true,
		});

		let totalNFTs = 0;
		let progressBarStarted = false;
		const progressCallback = (completed, total, errors) => {
			if (!progressBarStarted && total > 0) {
				totalNFTs = total;
				progressBar.start(total, completed, { errors });
				progressBarStarted = true;
			}
			else if (progressBarStarted && total > totalNFTs) {
				totalNFTs = total;
				progressBar.setTotal(total);
			}
			if (progressBarStarted) {
				progressBar.update(completed, { errors });
			}
		};

		const ctx = await getStaticDataViaMirrors(env, address, collection, null, null, dryRun, progressCallback);

		if (progressBarStarted) {
			progressBar.stop();
		}

		// Export errors if any occurred
		if (ctx && ctx.getTotalErrorCount() > 0) {
			const errorFile = await ctx.exportErrors();
			console.log(`  ⚠ ${ctx.getTotalErrorCount()} errors - saved to: ${errorFile}`);
		}

		logger.info('Collection completed', { address, collection, errors: ctx?.getTotalErrorCount() || 0 });
	}

	console.log(`\n${'='.repeat(80)}`);
	console.log(`✓ Bulk upload complete: ${validation.valid.length} collections processed`);
	console.log('  Run "node analyzeErrors.js --all" to analyze all errors.');
	console.log('='.repeat(80));
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