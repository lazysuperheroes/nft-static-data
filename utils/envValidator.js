/**
 * Environment Variable Validator
 * Validates required environment variables on startup
 */

function validateEnvironment() {
	const required = [
		'DIRECTUS_DB_URL',
		'DIRECTUS_TOKEN',
		'FILEBASE_PINNING_SERVICE',
		'FILEBASE_PINNING_API_KEY',
	];

	const missing = required.filter(key => !process.env[key]);

	if (missing.length > 0) {
		console.error('❌ Missing required environment variables:');
		missing.forEach(key => console.error(`   - ${key}`));
		console.error('\n📝 Please create a .env file with the following variables:');
		console.error('   DIRECTUS_DB_URL=https://your-directus-instance.com');
		console.error('   DIRECTUS_TOKEN=your-static-token-here');
		console.error('   FILEBASE_PINNING_SERVICE=https://api.filebase.io/v1/ipfs/pins');
		console.error('   FILEBASE_PINNING_API_KEY=your-filebase-api-key-here');
		console.error('\n💡 See README.md for more information.');
		process.exit(1);
	}

	console.log('✓ Environment variables validated');
	return true;
}

module.exports = { validateEnvironment };
