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
```

### Required Directus Collections

Your Directus instance needs these collections:

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
node upload.js <tokenAddress>
```

**Example:**
```bash
node upload.js 0.0.1234567
```

**Interactive Prompts:**
1. Choose environment (MAIN/TEST)
2. Confirm or customize collection name (defaults to token symbol)
3. Confirm to proceed with upload

**What It Does:**
- Fetches token details from Hedera mirror node
- Retrieves metadata for all NFT serials
- Parses and normalizes metadata
- Pins IPFS content to Filebase
- Stores in Directus database

**When to Use:**
- Adding a new collection to the database
- Re-scraping a collection with updates
- Initial setup for a single NFT project

---

### bulkUpload.js - Multiple Collections Upload

**Purpose:** Upload metadata for multiple NFT collections in a single run.

**Usage:**
```bash
node bulkUpload.js <address1>,<address2>,<address3>
```

**Example:**
```bash
node bulkUpload.js 0.0.1234567,0.0.7654321,0.0.9999999
```

**Interactive Prompts:**
1. Choose environment (MAIN/TEST)
2. Enable/disable interactive mode
3. If interactive: confirm each collection name and upload

**Interactive vs Non-Interactive:**
- **Interactive:** Prompts for confirmation before each collection
- **Non-Interactive:** Uses default names and processes all automatically

**What It Does:**
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
                  (TokenStaticData)                      (IPFS Storage)
                          ↓                                      ↓
                    Lazy dApp                          Filebase Gateway
                (Fast Access)                      (Reliable Retrieval)
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

3. **Static Data Manager** (`tokenStaticDataHelper.js`)
   - Manages Directus database operations
   - Handles IPFS pinning via Filebase
   - Tracks CIDs and pin status

4. **Filebase Helper** (`filebaseHelper.js`)
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
  - Exponential backoff

### tokenStaticDataHelper.js

Database and pinning operations:

- `getStaticData(address, serials)` - Query specific NFTs
- `writeStaticData(dataList)` - Bulk insert metadata
- `pinIPFS(cid, name, isImage)` - Pin to Filebase
- `confirmPin(cid)` - Verify pin status
- `isValidCID(cid)` - Validate IPFS CID format

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

## Support

For issues or questions:
1. Check this README first
2. Review error messages and troubleshooting section
3. Verify environment configuration
4. Check Hedera mirror node status
5. Test database connectivity

## License

[Add your license here]