#!/usr/bin/env node
/**
 * Credential Management CLI
 *
 * Manage credentials securely using OS keychain or environment files.
 *
 * Usage:
 *   node manageCredentials.js status      - Show credential status
 *   node manageCredentials.js migrate     - Migrate .env to keychain
 *   node manageCredentials.js set <name>  - Set a credential in keychain
 *   node manageCredentials.js delete <name> - Remove from keychain
 */

const {
	validateCredentials,
	displayCredentialStatus,
	isKeychainAvailable,
	migrateToKeychain,
	setCredentialSecure,
	deleteCredentialSecure,
	maskCredential,
	REQUIRED_CREDENTIALS,
} = require('./utils/credentialManager');
const readlineSync = require('readline-sync');

require('dotenv').config();

async function main() {
	const args = process.argv.slice(2);
	const command = args[0] || 'status';

	console.log('\n=== NFT Static Data - Credential Manager ===\n');

	switch (command) {
	case 'status':
		await showStatus();
		break;

	case 'migrate':
		await migrate();
		break;

	case 'set':
		await setCredential(args[1]);
		break;

	case 'delete':
		await deleteCredential(args[1]);
		break;

	default:
		showHelp();
	}
}

async function showStatus() {
	console.log('Keychain available:', isKeychainAvailable() ? 'Yes' : 'No (install keytar)');
	console.log('');

	displayCredentialStatus();

	const result = validateCredentials(false);
	if (result.valid) {
		console.log('All credentials configured.\n');
	}
	else {
		console.log('Missing credentials:', result.missing.join(', '));
		console.log('\nRun with --help for setup options.\n');
	}
}

async function migrate() {
	if (!isKeychainAvailable()) {
		console.log('Keychain not available.');
		console.log('Install keytar: npm install keytar\n');
		return;
	}

	console.log('Migrating sensitive credentials from .env to OS keychain...\n');

	const count = await migrateToKeychain();

	if (count === 0) {
		console.log('No credentials to migrate (either already migrated or not set in .env).\n');
	}
	else {
		console.log('\nAfter migration, you can remove these from .env:');
		for (const [name, config] of Object.entries(REQUIRED_CREDENTIALS)) {
			if (config.sensitive) {
				console.log(`  - ${name}`);
			}
		}
		console.log('');
	}
}

async function setCredential(name) {
	if (!isKeychainAvailable()) {
		console.log('Keychain not available.');
		console.log('Install keytar: npm install keytar\n');
		return;
	}

	if (!name) {
		console.log('Available credentials:\n');
		for (const [credName, config] of Object.entries(REQUIRED_CREDENTIALS)) {
			console.log(`  ${credName} - ${config.description}`);
		}
		console.log('\nUsage: node manageCredentials.js set <credential-name>\n');
		return;
	}

	if (!REQUIRED_CREDENTIALS[name]) {
		console.log(`Unknown credential: ${name}`);
		console.log('Valid names:', Object.keys(REQUIRED_CREDENTIALS).join(', '));
		return;
	}

	const config = REQUIRED_CREDENTIALS[name];
	console.log(`Setting ${config.description}...\n`);

	const value = readlineSync.question('Enter value: ', {
		hideEchoBack: config.sensitive,
		mask: '*',
	});

	if (!value) {
		console.log('Cancelled - no value provided.\n');
		return;
	}

	const success = await setCredentialSecure(name, value);
	if (success) {
		console.log(`\nStored ${name} in keychain: ${maskCredential(value)}\n`);
	}
	else {
		console.log('\nFailed to store credential.\n');
	}
}

async function deleteCredential(name) {
	if (!isKeychainAvailable()) {
		console.log('Keychain not available.\n');
		return;
	}

	if (!name) {
		console.log('Usage: node manageCredentials.js delete <credential-name>\n');
		return;
	}

	const confirm = readlineSync.keyInYNStrict(`Delete ${name} from keychain?`);
	if (!confirm) {
		console.log('Cancelled.\n');
		return;
	}

	const success = await deleteCredentialSecure(name);
	if (success) {
		console.log(`\nRemoved ${name} from keychain.\n`);
	}
	else {
		console.log('\nFailed to remove credential (may not exist).\n');
	}
}

function showHelp() {
	console.log('Usage: node manageCredentials.js <command> [args]\n');
	console.log('Commands:');
	console.log('  status              Show credential status');
	console.log('  migrate             Migrate .env credentials to keychain');
	console.log('  set <name>          Set a credential in keychain');
	console.log('  delete <name>       Remove credential from keychain');
	console.log('');
	console.log('Examples:');
	console.log('  node manageCredentials.js status');
	console.log('  node manageCredentials.js migrate');
	console.log('  node manageCredentials.js set DIRECTUS_TOKEN');
	console.log('');
}

main().catch(error => {
	console.error('Error:', error.message);
	process.exit(1);
});
