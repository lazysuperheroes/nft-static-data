#!/usr/bin/env node
/**
 * Filebase Pin Status Checker
 *
 * Interactive CLI to check and manage IPFS pins on Filebase.
 * Integrates with error export files for targeted pin management.
 *
 * Usage:
 *   node checkFileBaseStatus.js              # Interactive menu
 *   node checkFileBaseStatus.js --status     # Show pin status summary
 *   node checkFileBaseStatus.js --failed     # List all failed pins
 *   node checkFileBaseStatus.js --retry      # Retry failed CIDs from latest error export
 *   node checkFileBaseStatus.js --cleanup    # Delete all failed pins
 */

const axios = require('axios');
const readlineSync = require('readline-sync');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const config = require('./config');

const filebasePinningService = process.env.FILEBASE_PINNING_SERVICE;
const filebasePinningApiKey = process.env.FILEBASE_PINNING_API_KEY;

/**
 * Parse command line arguments
 */
function parseArgs() {
	const args = process.argv.slice(2);
	return {
		status: args.includes('--status'),
		failed: args.includes('--failed'),
		retry: args.includes('--retry'),
		cleanup: args.includes('--cleanup'),
		help: args.includes('--help') || args.includes('-h'),
	};
}

/**
 * Get pin status summary from Filebase
 */
async function getPinStatusSummary() {
	const statuses = ['queued', 'pinning', 'pinned', 'failed'];
	const summary = {};

	for (const status of statuses) {
		try {
			const response = await axios.get(`${filebasePinningService}?status=${status}&limit=1`, {
				headers: { Authorization: `Bearer ${filebasePinningApiKey}` },
			});
			summary[status] = response.data.count || 0;
		}
		catch (error) {
			summary[status] = `Error: ${error.message}`;
		}
	}

	return summary;
}

/**
 * Get all pins with a specific status
 */
async function getPinsByStatus(status, limit = 100) {
	const pins = [];
	let hasMore = true;

	while (hasMore && pins.length < limit) {
		try {
			const response = await axios.get(`${filebasePinningService}?status=${status}&limit=100`, {
				headers: { Authorization: `Bearer ${filebasePinningApiKey}` },
			});

			const results = response.data.results || [];
			pins.push(...results);

			// Filebase doesn't support pagination the same way, so we just get what we get
			hasMore = false;
		}
		catch (error) {
			console.error(`Error fetching ${status} pins:`, error.message);
			hasMore = false;
		}
	}

	return pins;
}

/**
 * Delete a pin by request ID
 */
async function deletePin(requestId) {
	try {
		const response = await axios.delete(`${filebasePinningService}/${requestId}`, {
			headers: { Authorization: `Bearer ${filebasePinningApiKey}` },
		});
		return { success: true, status: response.status };
	}
	catch (error) {
		return { success: false, error: error.message };
	}
}

/**
 * Delete all failed pins
 */
async function deleteAllFailedPins() {
	console.log('Fetching failed pins...');
	let deleted = 0;
	let hasMore = true;

	while (hasMore) {
		try {
			const response = await axios.get(`${filebasePinningService}?status=failed&limit=100`, {
				headers: { Authorization: `Bearer ${filebasePinningApiKey}` },
			});

			const results = response.data.results || [];
			if (results.length === 0) {
				hasMore = false;
				break;
			}

			for (const item of results) {
				const result = await deletePin(item.requestid);
				if (result.success) {
					console.log(`  Deleted: ${item.pin.cid}`);
					deleted++;
				}
				else {
					console.error(`  Failed to delete ${item.pin.cid}: ${result.error}`);
				}
			}

			console.log(`Progress: ${deleted} deleted so far, ${response.data.count} total failed`);
		}
		catch (error) {
			console.error('Error:', error.message);
			hasMore = false;
		}
	}

	console.log(`\nTotal deleted: ${deleted}`);
	return deleted;
}

/**
 * Check CID status
 */
async function checkCIDStatus(cid) {
	try {
		const response = await axios.get(`${filebasePinningService}?cid=${cid}`, {
			headers: { Authorization: `Bearer ${filebasePinningApiKey}` },
		});
		return response.data.results || [];
	}
	catch (error) {
		return { error: error.message };
	}
}

/**
 * Pin a CID
 */
async function pinCID(cid, name = null) {
	try {
		const response = await axios.post(filebasePinningService, {
			cid,
			name: name || `retry-${cid}`,
		}, {
			headers: {
				Authorization: `Bearer ${filebasePinningApiKey}`,
				'Content-Type': 'application/json',
			},
		});
		return { success: true, data: response.data };
	}
	catch (error) {
		return { success: false, error: error.response?.data?.error || error.message };
	}
}

/**
 * Find the latest error export file
 */
function findLatestErrorFile() {
	const stateDir = config.cache?.progressStateDir || './state';
	if (!fs.existsSync(stateDir)) return null;

	const files = fs.readdirSync(stateDir)
		.filter(f => f.startsWith('errors-') && f.endsWith('.json'))
		.map(f => ({
			name: f,
			path: path.join(stateDir, f),
			mtime: fs.statSync(path.join(stateDir, f)).mtime,
		}))
		.sort((a, b) => b.mtime - a.mtime);

	return files.length > 0 ? files[0] : null;
}

/**
 * Retry pinning failed CIDs from error export
 */
async function retryFromErrorExport() {
	const errorFile = findLatestErrorFile();
	if (!errorFile) {
		console.log('No error export file found.');
		return;
	}

	console.log(`Reading error file: ${errorFile.name}`);
	const data = JSON.parse(fs.readFileSync(errorFile.path, 'utf8'));

	// Extract CIDs from pin errors
	const cidsToRetry = new Set();
	if (data.errors) {
		for (const error of data.errors) {
			if (error.cid && (error.category === 'pinMetadata' || error.category === 'pinImage')) {
				cidsToRetry.add(error.cid);
			}
		}
	}

	if (cidsToRetry.size === 0) {
		console.log('No pinning errors found in error export.');
		return;
	}

	console.log(`Found ${cidsToRetry.size} CIDs to retry pinning.\n`);

	let successful = 0;
	let failed = 0;

	for (const cid of cidsToRetry) {
		// First check if already pinned
		const existing = await checkCIDStatus(cid);
		if (existing.length > 0 && existing[0].status === 'pinned') {
			console.log(`  ${cid}: Already pinned`);
			successful++;
			continue;
		}

		// Delete any failed existing pin
		if (existing.length > 0 && existing[0].status === 'failed') {
			await deletePin(existing[0].requestid);
		}

		// Retry pin
		const result = await pinCID(cid);
		if (result.success) {
			console.log(`  ${cid}: Pin request submitted`);
			successful++;
		}
		else {
			console.log(`  ${cid}: Failed - ${result.error}`);
			failed++;
		}
	}

	console.log(`\nRetry complete: ${successful} successful, ${failed} failed`);
}

/**
 * Interactive menu
 */
async function interactiveMenu() {
	console.log('Filebase Pin Status Checker\n');
	console.log(`Service: ${filebasePinningService || 'NOT CONFIGURED'}`);
	console.log('');

	if (!filebasePinningService || !filebasePinningApiKey) {
		console.error('Error: FILEBASE_PINNING_SERVICE and FILEBASE_PINNING_API_KEY must be set');
		process.exit(1);
	}

	const values = [
		'Show status summary',
		'List queued pins',
		'List pinning (in progress)',
		'List pinned (complete)',
		'List failed pins',
		'Check specific CID',
		'Delete specific pin',
		'Delete all failed pins',
		'Retry from error export',
		'Exit',
	];

	let running = true;
	while (running) {
		const query = readlineSync.keyInSelect(values, '\nSelect action:');

		if (query === -1 || query === 9) {
			console.log('Goodbye!');
			running = false;
			continue;
		}

		console.log('');

		await handleMenuSelection(query);
	}
}

/**
 * Handle menu selection
 */
async function handleMenuSelection(query) {
	// Status summary
	if (query === 0) {
		console.log('Fetching status summary...');
		const summary = await getPinStatusSummary();
		console.log('\nPin Status Summary:');
		for (const [status, count] of Object.entries(summary)) {
			console.log(`  ${status}: ${count}`);
		}
		return;
	}

	// List pins by status (queued, pinning, pinned, failed)
	if (query >= 1 && query <= 4) {
		const statusMap = ['queued', 'pinning', 'pinned', 'failed'];
		const status = statusMap[query - 1];
		console.log(`Fetching ${status} pins...`);
		const pins = await getPinsByStatus(status);
		console.log(`\n${status.charAt(0).toUpperCase() + status.slice(1)} Pins (${pins.length}):`);
		for (const pin of pins.slice(0, 50)) {
			console.log(`  ${pin.requestid} - ${pin.pin.cid}`);
		}
		if (pins.length > 50) {
			console.log(`  ... and ${pins.length - 50} more`);
		}
		return;
	}

	// Check specific CID
	if (query === 5) {
		const cid = readlineSync.question('Enter CID: ');
		const results = await checkCIDStatus(cid);
		if (results.error) {
			console.log(`Error: ${results.error}`);
		}
		else if (results.length === 0) {
			console.log('CID not found in Filebase');
		}
		else {
			for (const pin of results) {
				console.log(`  Status: ${pin.status}`);
				console.log(`  Request ID: ${pin.requestid}`);
				console.log(`  Created: ${pin.created}`);
			}
		}
		return;
	}

	// Delete specific pin
	if (query === 6) {
		const requestId = readlineSync.question('Enter Request ID: ');
		const result = await deletePin(requestId);
		if (result.success) {
			console.log('Pin deleted successfully');
		}
		else {
			console.log(`Error: ${result.error}`);
		}
		return;
	}

	// Delete all failed
	if (query === 7) {
		if (readlineSync.keyInYN('Are you sure you want to delete all failed pins?')) {
			await deleteAllFailedPins();
		}
		return;
	}

	// Retry from error export
	if (query === 8) {
		await retryFromErrorExport();
	}
}

/**
 * Main entry point
 */
async function main() {
	const args = parseArgs();

	if (args.help) {
		console.log(`
Filebase Pin Status Checker

Usage:
  node checkFileBaseStatus.js              # Interactive menu
  node checkFileBaseStatus.js --status     # Show pin status summary
  node checkFileBaseStatus.js --failed     # List all failed pins
  node checkFileBaseStatus.js --retry      # Retry failed CIDs from error export
  node checkFileBaseStatus.js --cleanup    # Delete all failed pins

Options:
  --status     Show summary of pin statuses
  --failed     List all failed pins
  --retry      Retry pinning CIDs from latest error export file
  --cleanup    Delete all failed pins (non-interactive)
  --help, -h   Show this help message
`);
		return;
	}

	if (!filebasePinningService || !filebasePinningApiKey) {
		console.error('Error: FILEBASE_PINNING_SERVICE and FILEBASE_PINNING_API_KEY must be set');
		process.exit(1);
	}

	if (args.status) {
		const summary = await getPinStatusSummary();
		console.log('Pin Status Summary:');
		for (const [status, count] of Object.entries(summary)) {
			console.log(`  ${status}: ${count}`);
		}
	}
	else if (args.failed) {
		const pins = await getPinsByStatus('failed');
		console.log(`Failed Pins (${pins.length}):`);
		for (const pin of pins) {
			console.log(`  ${pin.requestid} - ${pin.pin.cid}`);
		}
	}
	else if (args.retry) {
		await retryFromErrorExport();
	}
	else if (args.cleanup) {
		await deleteAllFailedPins();
	}
	else {
		await interactiveMenu();
	}
}

// Run if called directly
if (require.main === module) {
	main().catch(console.error);
}

module.exports = {
	getPinStatusSummary,
	getPinsByStatus,
	deletePin,
	deleteAllFailedPins,
	checkCIDStatus,
	pinCID,
	retryFromErrorExport,
};
