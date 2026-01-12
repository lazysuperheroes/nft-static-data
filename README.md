# NFT Static Data Uploader

A comprehensive tool suite for scraping, storing, and managing NFT metadata from Hedera networks. This project works in conjunction with the Lazy dApp to enable faster NFT operations by pre-caching static metadata.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Setup](#environment-setup)
- [Scripts & Usage](#scripts--usage)
  - [upload.js - Single Collection Upload](#uploadjs---single-collection-upload)
  - [bulkUpload.js - Multiple Collections Upload](#bulkuploadjs---multiple-collections-upload)
  - [uploadEligibleNFTs.js - Register Eligible Collections](#uploadeligiblenftsjs---register-eligible-collections)
  - [validatePins.js - Verify IPFS Pins](#validatepinsjs---verify-ipfs-pins)
  - [checkFileBaseStatus.js - Monitor Filebase](#checkfilebasestatusjs---monitor-filebase)
  - [getStaticData.js - Query Metadata](#getstaticdatajs---query-metadata)
  - [getPost.js - Test Database Connection](#getpostjs---test-database-connection)
- [Architecture](#architecture)
- [Utilities](#utilities)
- [Workflow](#workflow)
- [Troubleshooting](#troubleshooting)

## Overview

This project solves the problem of slow NFT metadata retrieval by:

1. **Scraping** NFT metadata from Hedera mirror nodes
2. **Storing** metadata in a Directus database for fast access
3. **Pinning** IPFS content to Filebase for reliable availability
4. **Managing** eligible NFT collections for the Lazy dApp

### Why This Exists

NFT metadata is typically stored on IPFS or other decentralized storage. Fetching this metadata on-demand can be slow and unreliable due to:
- Gateway timeouts
- Rate limiting
- Network congestion
- Missing or unpinned content

By pre-fetching and storing this data, the Lazy dApp can provide instant access to NFT metadata for staking, farming, and other features.

## Prerequisites

- **Node.js** (v16 or higher)
- **Hedera Network Access** (mainnet/testnet)
- **Directus Database** with proper collections configured
- **Filebase Account** with pinning service API access
- **Environment Variables** configured (see below)

## Installation

```bash
npm install
```

### Dependencies

- `@directus/sdk` - Database operations
- `@hashgraph/sdk` - Hedera network interaction
- `axios` - HTTP requests
- `cross-fetch` - Universal fetch API
- `dotenv` - Environment variable management
- `readline-sync` - Interactive CLI prompts

## Environment Setup

Create a `.env` file in the project root:

```env
# Directus Database
DIRECTUS_DB_URL=https://your-directus-instance.com
DIRECTUS_TOKEN=your-static-token-here

# Filebase IPFS Pinning
FILEBASE_PINNING_SERVICE=https://api.filebase.io/v1/ipfs/pins
FILEBASE_PINNING_API_KEY=your-filebase-api-key-here

# Optional: Schema Selection (default: TokenStaticData)
# Use 'SecureTradeMetadata' for marketplace integration
DB_SCHEMA=TokenStaticData
```

### Credential Security

Credentials are validated at startup. Use the `--verbose` flag to display masked credential values (shows first 2 and last 2 characters only):

```bash
node upload.js 0.0.1234567 --verbose
```

Example output:
```
=== Loaded Credentials ===

[+] Directus Database URL
    DIRECTUS_DB_URL: ht********om
[+] Directus API Token
    DIRECTUS_TOKEN: ab********yz
[+] Filebase Pinning Service URL
    FILEBASE_PINNING_SERVICE: ht********ns
[+] Filebase API Key
    FILEBASE_PINNING_API_KEY: sk********23

==========================
```

### Required Directus Collections

Your Directus instance needs these collections:

#### Schema: TokenStaticData (Default - Lazy dApp)

1. **TokenStaticData**
   - `uid` (string) - Unique identifier (tokenId!serial)
   - `address` (string) - Token address (0.0.XXXX)
   - `serial` (integer) - NFT serial number
   - `metadata` (text) - Original metadata string
   - `rawMetadata` (json) - Parsed JSON metadata
   - `image` (string) - Image URL/CID
   - `attributes` (json) - NFT attributes
   - `nftName` (string) - NFT name
   - `collection` (string) - Collection name
   - `environment` (string) - Network (mainnet/testnet)

#### Schema: SecureTradeMetadata (Marketplace)

Set `DB_SCHEMA=SecureTradeMetadata` to use this schema:

1. **SecureTradeMetadata**
   - `uid` (string) - Unique identifier (tokenId-serial)
   - `token_id` (string) - Token address (0.0.XXXX)
   - `serial_number` (integer) - NFT serial number
   - `name` (string) - NFT name
   - `collection` (string) - Collection name
   - `cid` (string) - Metadata CID
   - `image` (string) - Image URL/CID
   - `downloaded_to_file` (boolean) - Whether image is cached locally
   - `fully_enriched` (boolean) - Whether all metadata is complete
   - `rawMetadataJson` (text) - Full JSON metadata

#### Common Collections (Both Schemas)

2. **eligibleNfts**
   - `tokenId` (string) - Token address
   - `evmTokenId` (string) - EVM-compatible address
   - `NiceName` (string) - Display name
   - `type` (array) - Allowed types (staking, mission_req, etc.)
   - `Environment` (array) - Networks where eligible

3. **cidDB**
   - `cid` (string, primary key) - IPFS CID
   - `pin_confirmed` (boolean) - Whether pinned to Filebase

4. **post** (used for testing)

## Scripts & Usage

### upload.js - Single Collection Upload

**Purpose:** Upload metadata for a single NFT collection to the database.

**Usage:**
```bash
node upload.js <tokenAddress> [options]
```

**Options:**
- `--dry-run, -d` - Simulate the upload without making changes
- `--resume, -r` - Resume from last saved progress
- `--verbose, -v` - Show masked credential values

**Example:**
```bash
# Basic upload
node upload.js 0.0.1234567

# Dry run to preview changes
node upload.js 0.0.1234567 --dry-run

# Resume interrupted upload
node upload.js 0.0.1234567 --resume

# Show credentials and upload
node upload.js 0.0.1234567 --verbose
```

**Interactive Prompts:**
1. Choose environment (MAIN/TEST)
2. Optionally resume from previous progress (if --resume)
3. Confirm or customize collection name (defaults to token symbol)
4. Confirm to proceed with upload

**What It Does:**
- Validates environment credentials
- Preloads CID cache from database (reduces lookups)
- Fetches token details from Hedera mirror node
- Retrieves metadata for all NFT serials
- Parses and normalizes metadata
- Pins IPFS content to Filebase
- Stores in Directus database (using configured schema)
- Saves progress for resume capability

**When to Use:**
- Adding a new collection to the database
- Re-scraping a collection with updates
- Initial setup for a single NFT project

---

### bulkUpload.js - Multiple Collections Upload

**Purpose:** Upload metadata for multiple NFT collections in a single run.

**Usage:**
```bash
node bulkUpload.js <address1>,<address2>,<address3> [options]
```

**Options:**
- `--dry-run, -d` - Simulate the upload without making changes

**Example:**
```bash
# Process multiple collections
node bulkUpload.js 0.0.1234567,0.0.7654321,0.0.9999999

# Dry run to preview
node bulkUpload.js 0.0.1234567,0.0.7654321 --dry-run
```

**Interactive Prompts:**
1. Choose environment (MAIN/TEST)
2. Enable/disable interactive mode
3. If interactive: confirm each collection name and upload

**Interactive vs Non-Interactive:**
- **Interactive:** Prompts for confirmation before each collection
- **Non-Interactive:** Uses default names and processes all automatically

**What It Does:**
- Validates all addresses before processing
- Preloads CID cache from database (reduces lookups)
- Processes multiple collections sequentially
- Uses token symbol as default collection name
- Same metadata fetching and storage as single upload

**When to Use:**
- Onboarding multiple collections at once
- Batch processing for efficiency
- Automated scheduled updates (non-interactive mode)

---

### uploadEligibleNFTs.js - Register Eligible Collections

**Purpose:** Mark NFT collections as eligible for use in the Lazy dApp (staking, missions, etc.).

**Usage:**
```bash
node uploadEligibleNFTs.js <address1>,<address2>
```

**Example:**
```bash
node uploadEligibleNFTs.js 0.0.1234567,0.0.7654321
```

**Interactive Prompts:**
1. Choose environment (mainnet/testnet/previewnet)
2. For each new collection:
   - Select allowed types (staking, staking_boost, mission_req, gem_boost)
   - Confirm selections

**Allowed Types:**
- **staking** - Can be staked for rewards
- **staking_boost** - Provides boosted staking rewards
- **mission_req** - Required for missions
- **gem_boost** - Boosts gem earnings
- **NULL** - No special functionality

**What It Does:**
- Checks which collections are already registered
- Filters out duplicates
- Fetches collection details from mirror node
- Prompts for type selection
- Writes to eligibleNfts table

**When to Use:**
- Enabling a collection for staking/farming
- Adding collections to mission requirements
- Updating collection capabilities

---

### validatePins.js - Verify IPFS Pins

**Purpose:** Confirm that IPFS content has been successfully pinned to Filebase.

**Usage:**
```bash
node validatePins.js [-force]
```

**Options:**
- No flag: Check and mark confirmed pins
- `-force`: Re-pin failed or unconfirmed CIDs

**What It Does:**
- Queries database for unconfirmed pins
- Checks Filebase pinning status
- Updates `pin_confirmed` flag in database
- Optionally forces re-pinning

**Processing:**
- Batch size: 20 concurrent checks
- Continues until all unconfirmed pins processed

**When to Use:**
- After bulk uploads to verify pins
- Troubleshooting missing content
- Maintenance task to ensure availability
- Recovery after Filebase issues

**Recommended Schedule:**
- Run daily as a maintenance task
- Run immediately after large uploads
- Run with `-force` to recover failed pins

---

### checkFileBaseStatus.js - Monitor Filebase

**Purpose:** Query and manage Filebase pinning status interactively.

**Usage:**
```bash
node checkFileBaseStatus.js
```

**Interactive Options:**
1. **queued** - Show pins waiting to be processed
2. **pinning** - Show pins currently being pinned
3. **pinned** - Show successfully pinned content
4. **failed** - Show failed pins
5. **cid** - Look up specific CID status
6. **delete** - Remove a specific pin request
7. **delete all failed** - Bulk remove all failed pins

**What It Does:**
- Queries Filebase API for pin status
- Displays request IDs and CIDs
- Allows cleanup of failed pins
- Helps monitor pinning progress

**When to Use:**
- Debugging pinning issues
- Monitoring large batch uploads
- Cleaning up failed pin requests
- Investigating specific CID problems

**Limits:**
- Returns up to 100 results per query
- Delete operations are permanent

---

### getStaticData.js - Query Metadata

**Purpose:** Retrieve stored metadata for specific NFT serials (testing/debugging).

**Usage:**
```bash
node getStaticData.js <tokenAddress> <serial1,serial2,serial3>
```

**Example:**
```bash
node getStaticData.js 0.0.1234567 1,5,10,25
```

**Output:**
- Displays full metadata objects
- Shows count of items found

**When to Use:**
- Verifying data was stored correctly
- Testing database queries
- Debugging metadata issues
- Checking specific NFT details

---

### getPost.js - Test Database Connection

**Purpose:** Simple test to verify Directus connection.

**Usage:**
```bash
node getPost.js
```

**What It Does:**
- Queries the `post` collection
- Displays results

**When to Use:**
- Testing Directus credentials
- Verifying database connectivity
- Troubleshooting connection issues

---

### manageCredentials.js - Credential Management

**Purpose:** Securely manage credentials using OS keychain.

**Usage:**
```bash
node manageCredentials.js <command> [args]
```

**Commands:**
- `status` - Show credential status and keychain availability
- `migrate` - Migrate .env credentials to OS keychain
- `set <name>` - Set a credential in keychain
- `delete <name>` - Remove credential from keychain

**Examples:**
```bash
# Check credential status
node manageCredentials.js status

# Migrate sensitive credentials to keychain
node manageCredentials.js migrate

# Set a specific credential
node manageCredentials.js set DIRECTUS_TOKEN

# Remove a credential
node manageCredentials.js delete DIRECTUS_TOKEN
```

**What It Does:**
- Stores credentials in OS keychain (Windows Credential Manager, macOS Keychain, Linux Secret Service)
- Allows removing sensitive values from `.env` file
- Provides masked display of credential values

**Requirements:**
- Optional `keytar` package: `npm install keytar`
- Works without keytar (falls back to .env)

**When to Use:**
- Setting up secure local development
- Migrating from plaintext .env to keychain
- Managing credentials across multiple projects

## Configuration

### Schema Selection

The tool supports multiple database schemas for different use cases:

| Schema | Use Case | UID Format | Environment Variable |
|--------|----------|------------|---------------------|
| `TokenStaticData` | Lazy dApp (default) | `tokenId!serial` | `DB_SCHEMA=TokenStaticData` |
| `SecureTradeMetadata` | Marketplace | `tokenId-serial` | `DB_SCHEMA=SecureTradeMetadata` |

**Switching Schemas:**

```bash
# Use TokenStaticData (default)
node upload.js 0.0.1234567

# Use SecureTradeMetadata
DB_SCHEMA=SecureTradeMetadata node upload.js 0.0.1234567
```

Or set permanently in your `.env` file:
```env
DB_SCHEMA=SecureTradeMetadata
```

### CID Cache

The tool maintains a local cache of known CIDs to reduce database lookups. The cache is:

- **Loaded from file** on startup (`./cache/cid-cache.json`)
- **Preloaded from database** before processing (automatic)
- **Saved on exit** to persist across sessions

Cache location can be configured in `config.js`:
```javascript
cache: {
    cidCacheFile: './cache/cid-cache.json',
    progressStateDir: './state',
}
```

### Processing Configuration

Edit `config.js` to customize:

```javascript
module.exports = {
    processing: {
        maxRetries: 18,           // Retry attempts per CID
        concurrentRequests: 10,   // Parallel fetch requests
        timeoutMs: 30000,         // Request timeout
    },
    database: {
        writeBatchSize: 50,       // Records per write batch
        queryLimit: 100,          // Records per query
        schema: 'TokenStaticData' // or 'SecureTradeMetadata'
    },
    // ... other settings
};
```

## Architecture

### Data Flow

```
Hedera Mirror Node → Metadata Scraper → IPFS Gateways
                                              ↓
                                    Metadata Validation
                                              ↓
                          ┌──────────────────┴──────────────────┐
                          ↓                                      ↓
                  Directus Database                      Filebase Pinning
                  (Schema Adapter)                       (IPFS Storage)
                          ↓                                      ↓
                    Lazy dApp                          Filebase Gateway
                    Marketplace                     (Reliable Retrieval)
```

### Key Components

1. **Mirror Node Helpers** (`hederaMirrorHelpers.js`)
   - Interfaces with Hedera mirror nodes
   - Fetches token details, NFT metadata
   - Supports MAIN, TEST, PREVIEW networks

2. **Metadata Scraper** (`metadataScrapeHelper.js`)
   - Retrieves metadata from multiple IPFS gateways
   - Handles retries and failover
   - Supports IPFS, Arweave, HCS storage
   - Extracts and validates CIDs
   - Uses ProcessingContext for isolated state per job

3. **Processing Context** (`ProcessingContext.js`)
   - Encapsulates all processing state per job
   - Enables concurrent processing without state collision
   - Supports resume capability via serialization
   - Manages gateway rotation and statistics

4. **Schema Adapter** (`schemaAdapter.js`, `schemaWriter.js`)
   - Normalizes metadata between different database schemas
   - Supports TokenStaticData and SecureTradeMetadata
   - Provides schema-aware database operations
   - Enables code reuse across different deployments

5. **Static Data Manager** (`tokenStaticDataHelper.js`)
   - Manages Directus database operations
   - Handles IPFS pinning via Filebase
   - Tracks CIDs and pin status
   - Provides CID cache preloading from database

6. **Credential Manager** (`credentialManager.js`)
   - Validates required credentials at startup
   - Provides masked display (first 2 / last 2 characters)
   - Supports interactive credential prompts

7. **Filebase Helper** (`filebaseHelper.js`)
   - Checks pin status via HTTP
   - Interfaces with Filebase API
   - Maintains CID cache

## Utilities

### hederaMirrorHelpers.js

Core functions for Hedera network interaction:

- `getBaseURL(env)` - Get mirror node URL for environment
- `getTokenDetails(env, tokenId)` - Fetch token metadata
- `checkMirrorBalance(env, userId, tokenId)` - Check token balance
- `checkMirrorAllowance(env, userId, tokenId, spenderId)` - Check allowances

### metadataScrapeHelper.js

Metadata retrieval with resilience:

- **Multiple IPFS Gateways:**
  - cloudflare-ipfs.com
  - ipfs.eth.aragon.network
  - ipfs.io
  - ipfs.eternum.io
  - dweb.link

- **Arweave Support:**
  - arweave.net
  - ar-io.dev
  - permagate.io

- **Retry Logic:**
  - Max 18 attempts per CID
  - Gateway rotation
  - Exponential backoff with jitter

### tokenStaticDataHelper.js

Database and pinning operations:

- `getStaticData(address, serials)` - Query specific NFTs
- `writeStaticData(dataList)` - Bulk insert metadata
- `pinIPFS(cid, name, isImage)` - Pin to Filebase
- `confirmPin(cid)` - Verify pin status
- `isValidCID(cid)` - Validate IPFS CID format
- `preloadCIDCacheFromDB()` - Preload CID cache from database
- `getCIDCacheSize()` - Get current cache size
- `loadCIDCache()` / `saveCIDCache()` - File-based cache persistence

### schemaAdapter.js

Schema abstraction layer:

- `createAdapter(schemaName)` - Create adapter for schema
- `NormalizedMetadata` - Schema-agnostic metadata class
- `getAvailableSchemas()` - List supported schemas
- Field mapping between TokenStaticData and SecureTradeMetadata

### schemaWriter.js

Schema-aware database operations:

- `createWriter(schemaName)` - Create writer for schema
- `getExistingSerials(tokenId)` - Query existing records
- `writeMetadata(dataList)` - Write normalized metadata
- `deleteToken(tokenId)` - Delete all records for token

### credentialManager.js

Credential handling utilities:

- `maskCredential(value)` - Mask sensitive values (show first/last 2 chars)
- `validateCredentials()` - Validate all required credentials
- `displayCredentialStatus()` - Show masked credential summary
- `ensureCredentials()` - Validate with optional interactive prompts

### envValidator.js

Environment validation:

- `validateEnvironment()` - Check required env vars
- `displayMaskedCredentials()` - Show credentials with masking

### filebaseHelper.js

Filebase API integration:

- `checkPinHttp(cid)` - HTTP availability check
- `checkPinStatus(cid)` - Query Filebase API
- CID caching for performance

## Workflow

### Adding a New Collection

1. **Verify Token Address**
   ```bash
   # Get token details first
   node upload.js 0.0.XXXXXX
   # Follow prompts to upload metadata
   ```

2. **Make Collection Eligible**
   ```bash
   node uploadEligibleNFTs.js 0.0.XXXXXX
   # Select allowed types (staking, missions, etc.)
   ```

3. **Verify Pins**
   ```bash
   node validatePins.js
   ```

### Bulk Processing

1. **Prepare Address List**
   - Collect token addresses
   - Verify they're valid (0.0.XXXXX format)

2. **Run Bulk Upload**
   ```bash
   node bulkUpload.js 0.0.111111,0.0.222222,0.0.333333
   # Choose non-interactive for automation
   ```

3. **Register as Eligible**
   ```bash
   node uploadEligibleNFTs.js 0.0.111111,0.0.222222,0.0.333333
   ```

4. **Validate**
   ```bash
   node validatePins.js -force
   ```

### Maintenance

**Daily Tasks:**
```bash
# Check for unconfirmed pins
node validatePins.js

# Monitor Filebase status
node checkFileBaseStatus.js
# Select: queued/pinning to see progress
```

**Weekly Tasks:**
```bash
# Clean up failed pins
node checkFileBaseStatus.js
# Select: delete all failed

# Force re-pin unconfirmed
node validatePins.js -force
```

## Troubleshooting

### Common Issues

**"Invalid address" Error**
- Ensure format is `0.0.XXXXXX` (no spaces)
- Check token exists on the chosen network
- Verify network selection (MAIN vs TEST)

**"No NFTs found" Error**
- Token might not be an NFT (check if it's fungible)
- Token might be on wrong network
- Mirror node might be temporarily unavailable

**Metadata Fetch Timeouts**
- Normal for large collections (retries are automatic)
- Check IPFS gateway availability
- Consider running during off-peak hours
- Some NFTs may have unpinned/missing metadata

**Pin Verification Failures**
- Run `validatePins.js -force` to retry
- Check Filebase account status/quota
- Verify API key is valid
- Some CIDs may be permanently unavailable

**Database Connection Issues**
- Verify `.env` file exists and is configured
- Test connection: `node getPost.js`
- Check Directus token permissions
- Ensure collections are properly configured

### Error Codes

**Mirror Node Status:**
- 200-299: Success
- 400-499: Client error (check address/parameters)
- 500-599: Server error (retry later)

**Filebase Pin Status:**
- `queued`: Waiting to be processed
- `pinning`: Currently being pinned
- `pinned`: Successfully pinned
- `failed`: Pin failed (will retry or needs manual intervention)

### Performance Tips

1. **Batch Processing:**
   - Use bulkUpload.js for multiple collections
   - Non-interactive mode for automation
   - Process during off-peak hours

2. **Network Issues:**
   - Script automatically retries with multiple gateways
   - Failed serials are logged for review
   - Re-run script to catch missed items

3. **Database Optimization:**
   - Script checks for existing data before writing
   - Uses batch operations where possible
   - Filters duplicate entries

## Extending & Forking

If you want to customize this tool for your own use case, here's where to look:

### Adding a New Database Schema

1. **Define the schema** in `utils/schemaAdapter.js`:
   ```javascript
   // Add to SCHEMAS object
   MyCustomSchema: {
       tableName: 'MyCustomTable',
       primaryKey: 'uid',
       fields: {
           uid: { type: 'string', required: true },
           // ... your fields
       },
       createUid: (tokenId, serial) => `${tokenId}_${serial}`,
   }
   ```

2. **Add field mappings** in `FIELD_MAPPINGS`:
   ```javascript
   MyCustomSchema: {
       tokenId: 'my_token_field',
       serial: 'my_serial_field',
       // ... map normalized fields to your schema
   }
   ```

3. **Set via environment**: `DB_SCHEMA=MyCustomSchema`

### Adding New IPFS Gateways

Edit `config.js`:
```javascript
ipfs: {
    gateways: [
        'https://your-gateway.com/ipfs/',
        // ... existing gateways
    ],
}
```

### Adding New Storage Backends (Arweave, etc.)

1. Add gateway config in `config.js`
2. Update `fetchIPFSJson()` in `metadataScrapeHelper.js` to detect and handle the new protocol
3. Add CID validation in `tokenStaticDataHelper.js` if needed

### Customizing Processing Logic

Key extension points:

| File | Function | Purpose |
|------|----------|---------|
| `metadataScrapeHelper.js` | `processNFT()` | Per-NFT processing logic |
| `metadataScrapeHelper.js` | `fetchIPFSJson()` | Gateway selection & retry |
| `ProcessingContext.js` | Constructor | Add custom state tracking |
| `schemaAdapter.js` | `NormalizedMetadata` | Add custom metadata fields |

### Adding New CLI Commands

1. Create a new file (e.g., `myCommand.js`)
2. Import utilities from `utils/`
3. Use `validateEnvironment()` for credential checks
4. Use `preloadCIDCacheFromDB()` before processing

### Key Files Overview

```
├── upload.js              # Single collection CLI
├── bulkUpload.js          # Multi-collection CLI
├── config.js              # All configuration ← START HERE
└── utils/
    ├── metadataScrapeHelper.js   # Core scraping logic
    ├── ProcessingContext.js      # Job state management
    ├── schemaAdapter.js          # Schema definitions
    ├── schemaWriter.js           # Database operations
    ├── tokenStaticDataHelper.js  # Directus + pinning
    ├── credentialManager.js      # Credential handling
    └── gatewayManager.js         # Gateway rotation
```

## Using as a Library

This package can be used programmatically in your own code:

```javascript
const { getStaticDataViaMirrors, ProcessingContext } = require('nft-static-data');
const { createAdapter, NormalizedMetadata } = require('nft-static-data/utils/schemaAdapter');
const { preloadCIDCacheFromDB } = require('nft-static-data/utils/tokenStaticDataHelper');

// Preload cache
await preloadCIDCacheFromDB();

// Process a collection
const ctx = await getStaticDataViaMirrors(
    'MAIN',           // environment
    '0.0.1234567',    // tokenId
    'MyCollection',   // collection name
    null,             // existing serials (null = fetch from DB)
    null,             // routeUrl (internal)
    false,            // dryRun
    (completed, total, errors) => {
        console.log(`Progress: ${completed}/${total}`);
    }
);

console.log('Results:', ctx.getSummary());
```

## Secure Credential Storage

The tool supports **multiple credential sources** that work together. Credentials are loaded in this priority order:

1. **Environment variables** (from `.env` file or shell)
2. **OS Keychain** (if keytar is installed and credentials are stored)

This means you can:
- Use `.env` only (simple setup)
- Use keychain only (most secure)
- Use both (keychain for sensitive values, .env for URLs)

### Option 1: Environment File Only (Simple)

Create a `.env` file with all credentials:

```env
DIRECTUS_DB_URL=https://your-directus-instance.com
DIRECTUS_TOKEN=your-secret-token
FILEBASE_PINNING_SERVICE=https://api.filebase.io/v1/ipfs/pins
FILEBASE_PINNING_API_KEY=your-api-key
```

This works out of the box with no additional setup.

### Option 2: OS Keychain (Recommended for Security)

Store sensitive credentials in your OS keychain (Windows Credential Manager, macOS Keychain, or Linux Secret Service):

```bash
# Check current status
node manageCredentials.js status

# Migrate sensitive credentials from .env to keychain
node manageCredentials.js migrate

# Or set credentials individually
node manageCredentials.js set DIRECTUS_TOKEN
node manageCredentials.js set FILEBASE_PINNING_API_KEY
```

After migration, update your `.env` to only contain non-sensitive values:

```env
# .env - safe to have less sensitive values here
DIRECTUS_DB_URL=https://your-directus-instance.com
FILEBASE_PINNING_SERVICE=https://api.filebase.io/v1/ipfs/pins

# Sensitive values now in OS keychain - remove these lines:
# DIRECTUS_TOKEN=...
# FILEBASE_PINNING_API_KEY=...
```

**Benefits of keychain storage:**
- Credentials encrypted by OS
- Not stored in plaintext files
- Survives `.env` file deletion
- Works across terminal sessions

### Option 3: Hybrid Approach (Recommended for Teams)

Use `.env` for non-sensitive configuration and keychain for secrets:

```env
# .env - committed to repo or shared
DIRECTUS_DB_URL=https://your-directus-instance.com
FILEBASE_PINNING_SERVICE=https://api.filebase.io/v1/ipfs/pins
DB_SCHEMA=TokenStaticData
```

```bash
# Each developer sets up their own secrets locally
node manageCredentials.js set DIRECTUS_TOKEN
node manageCredentials.js set FILEBASE_PINNING_API_KEY
```

### Option 4: Encrypted Environment Files (CI/CD)

For automated deployments, use [dotenv-vault](https://www.dotenv.org/docs/security/env-vault) or [sops](https://github.com/getsops/sops):

```bash
# Encrypt your .env
npx dotenv-vault encrypt

# In CI/CD, use the encrypted vault
DOTENV_KEY=your-vault-key node upload.js 0.0.1234567
```

### Option 5: Cloud Secret Managers (Production)

For production deployments, integrate with cloud providers:

```javascript
// AWS Secrets Manager example
const { SecretsManager } = require('@aws-sdk/client-secrets-manager');

async function loadFromAWS() {
    const client = new SecretsManager({ region: 'us-east-1' });
    const secret = await client.getSecretValue({ SecretId: 'nft-scraper-creds' });
    const creds = JSON.parse(secret.SecretString);

    process.env.DIRECTUS_TOKEN = creds.DIRECTUS_TOKEN;
    process.env.FILEBASE_PINNING_API_KEY = creds.FILEBASE_API_KEY;
}
```

### Credential Priority & Loading

When the application starts, credentials are loaded in this order:

```
1. .env file loaded via dotenv
2. OS keychain checked for any missing credentials
3. Environment variables from shell (highest priority)
```

This means:
- Shell `export DIRECTUS_TOKEN=xxx` overrides everything
- `.env` values are used if set
- Keychain fills in any gaps

### Security Best Practices

1. **Never commit `.env` files** - Already in `.gitignore`
2. **Use masked display** - `--verbose` shows `ab****yz` format
3. **Prefer keychain for secrets** - Use `node manageCredentials.js migrate`
4. **Rotate credentials** - Especially after team changes
5. **Use least privilege** - Directus tokens should have minimal permissions
6. **Audit access** - Enable logging in Directus for API calls

## NPM Package Setup

To publish as an NPM package:

1. **Update package.json**:
   ```json
   {
     "name": "@your-org/nft-metadata-scraper",
     "version": "1.0.0",
     "main": "index.js",
     "exports": {
       ".": "./index.js",
       "./utils/*": "./utils/*.js"
     },
     "bin": {
       "nft-upload": "./upload.js",
       "nft-bulk-upload": "./bulkUpload.js"
     }
   }
   ```

2. **Create index.js** for clean exports:
   ```javascript
   module.exports = {
     getStaticDataViaMirrors: require('./utils/metadataScrapeHelper').getStaticDataViaMirrors,
     ProcessingContext: require('./utils/ProcessingContext'),
     SchemaAdapter: require('./utils/schemaAdapter'),
     // ... other exports
   };
   ```

3. **Publish**:
   ```bash
   npm login --scope=@your-org
   npm publish --access public
   ```

## Support

For issues or questions:
1. Check this README first
2. Review error messages and troubleshooting section
3. Verify environment configuration
4. Check Hedera mirror node status
5. Test database connectivity

## License

[Add your license here]