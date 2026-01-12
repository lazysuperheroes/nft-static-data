#!/usr/bin/env node
/**
 * Error Analysis Script
 *
 * Analyzes error logs and exported error files to identify patterns,
 * correlate with Filebase pin status, and suggest root causes.
 *
 * Usage:
 *   node analyzeErrors.js                    # Analyze latest error export
 *   node analyzeErrors.js --logs             # Parse winston log files
 *   node analyzeErrors.js --filebase         # Check Filebase pin status for failed CIDs
 *   node analyzeErrors.js --file <path>      # Analyze specific error export file
 *   node analyzeErrors.js --all              # Full analysis (logs + errors + filebase)
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const readline = require('readline');
require('dotenv').config();

const config = require('./config');

// Filebase API configuration
const filebasePinningService = process.env.FILEBASE_PINNING_SERVICE;
const filebasePinningApiKey = process.env.FILEBASE_PINNING_API_KEY;

/**
 * Parse command line arguments
 */
function parseArgs() {
	const args = process.argv.slice(2);
	return {
		logs: args.includes('--logs'),
		filebase: args.includes('--filebase'),
		all: args.includes('--all'),
		file: args.includes('--file') ? args[args.indexOf('--file') + 1] : null,
		help: args.includes('--help') || args.includes('-h'),
	};
}

/**
 * Find the latest error export file
 */
function findLatestErrorFile() {
	const stateDir = config.cache.progressStateDir;
	if (!fs.existsSync(stateDir)) return null;

	const files = fs.readdirSync(stateDir)
		.filter(f => f.startsWith('errors-') && f.endsWith('.json'))
		.map(f => ({
			name: f,
			path: path.join(stateDir, f),
			mtime: fs.statSync(path.join(stateDir, f)).mtime,
		}))
		.sort((a, b) => b.mtime - a.mtime);

	return files.length > 0 ? files[0].path : null;
}

/**
 * Analyze error export file
 */
async function analyzeErrorFile(filePath) {
	console.log('\n=== Error Export Analysis ===\n');

	if (!fs.existsSync(filePath)) {
		console.log(`File not found: ${filePath}`);
		return null;
	}

	const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

	console.log(`Token ID: ${data.tokenId || 'Unknown'}`);
	console.log(`Collection: ${data.collection || 'Unknown'}`);
	console.log(`Export Time: ${data.exportTime}`);
	console.log(`Total Errors: ${data.totalErrors}`);
	console.log('');

	// Summary by category
	if (data.summary && Object.keys(data.summary).length > 0) {
		console.log('Errors by Category:');
		for (const [category, info] of Object.entries(data.summary)) {
			console.log(`  ${category}: ${info.count}`);
			if (info.samples && info.samples.length > 0) {
				console.log('    Samples:');
				for (const sample of info.samples) {
					console.log(`      - Serial ${sample.serial}: ${sample.message}${sample.cid ? ` (CID: ${sample.cid})` : ''}`);
				}
			}
		}
	}

	// Extract unique CIDs for Filebase correlation
	const failedCIDs = new Set();
	if (data.errors) {
		for (const error of data.errors) {
			if (error.cid) {
				failedCIDs.add(error.cid);
			}
		}
	}

	console.log(`\nUnique CIDs with errors: ${failedCIDs.size}`);

	return { data, failedCIDs: Array.from(failedCIDs) };
}

/**
 * Parse winston log files for error patterns
 */
async function analyzeLogs() {
	console.log('\n=== Winston Log Analysis ===\n');

	const errorLogPath = config.logging.errorLogFile;
	if (!fs.existsSync(errorLogPath)) {
		console.log(`Error log not found: ${errorLogPath}`);
		return null;
	}

	const stats = {
		totalErrors: 0,
		byMessage: {},
		byTokenId: {},
		byCID: {},
		timeline: [],
	};

	const fileStream = fs.createReadStream(errorLogPath);
	const rl = readline.createInterface({
		input: fileStream,
		crlfDelay: Infinity,
	});

	for await (const line of rl) {
		try {
			const entry = JSON.parse(line);
			stats.totalErrors++;

			// Group by message type
			const msgKey = entry.message?.substring(0, 50) || 'Unknown';
			stats.byMessage[msgKey] = (stats.byMessage[msgKey] || 0) + 1;

			// Group by token ID
			if (entry.tokenId) {
				stats.byTokenId[entry.tokenId] = (stats.byTokenId[entry.tokenId] || 0) + 1;
			}

			// Track CIDs
			if (entry.cid) {
				stats.byCID[entry.cid] = (stats.byCID[entry.cid] || 0) + 1;
			}

			// Timeline (hourly buckets)
			if (entry.timestamp) {
				const hour = entry.timestamp.substring(0, 13);
				const existing = stats.timeline.find(t => t.hour === hour);
				if (existing) {
					existing.count++;
				}
				else {
					stats.timeline.push({ hour, count: 1 });
				}
			}
		}
		catch (_e) {
			// Skip non-JSON lines
		}
	}

	console.log(`Total error log entries: ${stats.totalErrors}`);

	if (Object.keys(stats.byMessage).length > 0) {
		console.log('\nTop Error Types:');
		const sorted = Object.entries(stats.byMessage)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 10);
		for (const [msg, count] of sorted) {
			console.log(`  ${count}x: ${msg}`);
		}
	}

	if (Object.keys(stats.byTokenId).length > 0) {
		console.log('\nErrors by Token ID:');
		const sorted = Object.entries(stats.byTokenId)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5);
		for (const [tokenId, count] of sorted) {
			console.log(`  ${tokenId}: ${count} errors`);
		}
	}

	if (Object.keys(stats.byCID).length > 0) {
		const repeatedCIDs = Object.entries(stats.byCID)
			.filter(([, count]) => count > 1)
			.sort((a, b) => b[1] - a[1]);
		if (repeatedCIDs.length > 0) {
			console.log('\nRepeatedly Failing CIDs:');
			for (const [cid, count] of repeatedCIDs.slice(0, 10)) {
				console.log(`  ${cid}: ${count} failures`);
			}
		}
	}

	return stats;
}

/**
 * Check Filebase pin status for a list of CIDs
 */
async function checkFilebaseStatus(cids = []) {
	console.log('\n=== Filebase Pin Status ===\n');

	if (!filebasePinningService || !filebasePinningApiKey) {
		console.log('Filebase credentials not configured. Skipping.');
		return null;
	}

	const results = {
		queued: [],
		pinning: [],
		pinned: [],
		failed: [],
		notFound: [],
	};

	// If no CIDs provided, get all failed pins from Filebase
	if (cids.length === 0) {
		console.log('Fetching all failed pins from Filebase...');
		try {
			const response = await axios.get(`${filebasePinningService}?status=failed&limit=100`, {
				headers: { Authorization: `Bearer ${filebasePinningApiKey}` },
			});
			results.failed = response.data.results || [];
			console.log(`Found ${results.failed.length} failed pins in Filebase`);

			if (results.failed.length > 0) {
				console.log('\nFailed Pins:');
				for (const pin of results.failed.slice(0, 20)) {
					console.log(`  ${pin.pin.cid} (Request ID: ${pin.requestid})`);
				}
				if (results.failed.length > 20) {
					console.log(`  ... and ${results.failed.length - 20} more`);
				}
			}

			// Also check queued/pinning
			const queuedResp = await axios.get(`${filebasePinningService}?status=queued&limit=100`, {
				headers: { Authorization: `Bearer ${filebasePinningApiKey}` },
			});
			results.queued = queuedResp.data.results || [];

			const pinningResp = await axios.get(`${filebasePinningService}?status=pinning&limit=100`, {
				headers: { Authorization: `Bearer ${filebasePinningApiKey}` },
			});
			results.pinning = pinningResp.data.results || [];

			console.log('\nPinning Status Summary:');
			console.log(`  Queued: ${results.queued.length}`);
			console.log(`  Pinning: ${results.pinning.length}`);
			console.log(`  Failed: ${results.failed.length}`);
		}
		catch (error) {
			console.error('Error fetching Filebase status:', error.message);
		}
	}
	else {
		// Check specific CIDs (limit to 50 to avoid rate limiting)
		console.log(`Checking status of ${cids.length} CIDs...`);
		for (const cid of cids.slice(0, 50)) {
			try {
				const response = await axios.get(`${filebasePinningService}?cid=${cid}`, {
					headers: { Authorization: `Bearer ${filebasePinningApiKey}` },
				});
				const pins = response.data.results || [];
				if (pins.length > 0) {
					const status = pins[0].status;
					results[status]?.push({ cid, ...pins[0] });
				}
				else {
					results.notFound.push(cid);
				}
			}
			catch (error) {
				console.error(`  Error checking ${cid}:`, error.message);
			}
		}

		console.log('\nCID Status Summary:');
		console.log(`  Pinned: ${results.pinned.length}`);
		console.log(`  Queued: ${results.queued.length}`);
		console.log(`  Pinning: ${results.pinning.length}`);
		console.log(`  Failed: ${results.failed.length}`);
		console.log(`  Not Found: ${results.notFound.length}`);
	}

	return results;
}

/**
 * Generate root cause analysis and recommendations
 */
function generateRecommendations(errorData, logStats, filebaseStatus) {
	console.log('\n=== Root Cause Analysis & Recommendations ===\n');

	const recommendations = [];

	// Check for gateway issues
	if (errorData?.summary?.fetchMetadata?.count > 0) {
		const fetchErrors = errorData.summary.fetchMetadata.count;
		if (fetchErrors > 10) {
			recommendations.push({
				issue: 'High metadata fetch failures',
				cause: 'IPFS/Arweave gateways may be slow or unreliable',
				action: 'Consider adding more gateways in config.js or increasing maxRetries',
			});
		}
	}

	// Check for pinning issues
	if (errorData?.summary?.pinMetadata?.count > 0 || errorData?.summary?.pinImage?.count > 0) {
		const pinErrors = (errorData.summary.pinMetadata?.count || 0) + (errorData.summary.pinImage?.count || 0);
		if (pinErrors > 5) {
			recommendations.push({
				issue: 'Multiple pin failures',
				cause: 'Filebase pinning service may be experiencing issues or rate limiting',
				action: 'Check Filebase dashboard, verify API key, consider retry with exponential backoff',
			});
		}
	}

	// Check Filebase failed pins
	if (filebaseStatus?.failed?.length > 0) {
		recommendations.push({
			issue: `${filebaseStatus.failed.length} pins in failed state`,
			cause: 'CIDs may be unretrievable from IPFS network or invalid',
			action: 'Run "node checkFileBaseStatus.js" and select "delete all failed" to clean up, then retry',
		});
	}

	// Check for stuck pins
	if (filebaseStatus?.queued?.length > 50 || filebaseStatus?.pinning?.length > 50) {
		recommendations.push({
			issue: 'Many pins stuck in queued/pinning state',
			cause: 'Filebase may be backlogged or the CIDs are hard to retrieve',
			action: 'Wait for Filebase to process, or check Filebase status page',
		});
	}

	// Check log patterns
	if (logStats?.byMessage) {
		for (const [msg, count] of Object.entries(logStats.byMessage)) {
			if (count > 50 && msg.includes('timeout')) {
				recommendations.push({
					issue: 'Frequent timeouts in logs',
					cause: 'Network issues or slow gateways',
					action: 'Increase timeout in config.js or switch to faster gateways',
				});
				break;
			}
		}
	}

	if (recommendations.length === 0) {
		console.log('No significant issues detected.');
	}
	else {
		for (let i = 0; i < recommendations.length; i++) {
			const rec = recommendations[i];
			console.log(`${i + 1}. ${rec.issue}`);
			console.log(`   Likely Cause: ${rec.cause}`);
			console.log(`   Recommended Action: ${rec.action}`);
			console.log('');
		}
	}

	return recommendations;
}

/**
 * Main entry point
 */
async function main() {
	const args = parseArgs();

	if (args.help) {
		console.log(`
Error Analysis Script

Usage:
  node analyzeErrors.js                    # Analyze latest error export
  node analyzeErrors.js --logs             # Parse winston log files
  node analyzeErrors.js --filebase         # Check Filebase pin status
  node analyzeErrors.js --file <path>      # Analyze specific error file
  node analyzeErrors.js --all              # Full analysis

Options:
  --logs       Parse winston error logs for patterns
  --filebase   Check Filebase pinning service status
  --file       Specify error export file to analyze
  --all        Run all analysis types
  --help, -h   Show this help message
`);
		return;
	}

	let errorData = null;
	let logStats = null;
	let filebaseStatus = null;

	// Analyze error export file
	const errorFile = args.file || findLatestErrorFile();
	if (errorFile) {
		const result = await analyzeErrorFile(errorFile);
		errorData = result?.data;

		// If --filebase or --all, check status of failed CIDs
		if ((args.filebase || args.all) && result?.failedCIDs?.length > 0) {
			filebaseStatus = await checkFilebaseStatus(result.failedCIDs);
		}
	}
	else if (!args.logs && !args.filebase) {
		console.log('No error export file found. Run with --logs to analyze log files.');
	}

	// Analyze winston logs
	if (args.logs || args.all) {
		logStats = await analyzeLogs();
	}

	// Check Filebase status (without specific CIDs)
	if ((args.filebase || args.all) && !filebaseStatus) {
		filebaseStatus = await checkFilebaseStatus();
	}

	// Generate recommendations
	if (errorData || logStats || filebaseStatus) {
		generateRecommendations(errorData, logStats, filebaseStatus);
	}
}

// Run if called directly
if (require.main === module) {
	main().catch(console.error);
}

module.exports = {
	analyzeErrorFile,
	analyzeLogs,
	checkFilebaseStatus,
	generateRecommendations,
	findLatestErrorFile,
};
