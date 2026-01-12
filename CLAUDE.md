# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NFT metadata uploader for the Lazy dApp on Hedera network. Scrapes NFT metadata from Hedera mirror nodes, stores it in Directus database, and pins IPFS content to Filebase for reliable availability.

## Commands

```bash
# Install dependencies
npm install

# Upload single collection
node upload.js <tokenAddress>
node upload.js 0.0.1234567 --dry-run    # Simulate without changes
node upload.js 0.0.1234567 --resume     # Resume from saved progress

# Upload multiple collections
node bulkUpload.js <addr1>,<addr2>,<addr3>

# Register collections as eligible for staking/missions
node uploadEligibleNFTs.js <addr1>,<addr2>

# Verify IPFS pins
node validatePins.js           # Check unconfirmed pins
node validatePins.js -force    # Re-pin failed CIDs

# Monitor Filebase status (interactive)
node checkFileBaseStatus.js

# Query stored metadata
node getStaticData.js <tokenAddress> <serial1,serial2>

# Test database connection
node getPost.js

# Lint
npx eslint .
```

## Architecture

```
├── upload.js / bulkUpload.js    # Main entry points for metadata upload
├── uploadEligibleNFTs.js        # Register collections for Lazy dApp features
├── validatePins.js              # IPFS pin verification
├── checkFileBaseStatus.js       # Filebase monitoring
├── config.js                    # Centralized configuration
└── utils/
    ├── hederaMirrorHelpers.js   # Hedera mirror node API
    ├── metadataScrapeHelper.js  # Metadata retrieval with gateway failover
    ├── tokenStaticDataHelper.js # Directus DB & Filebase pinning
    ├── filebaseHelper.js        # Filebase API integration
    ├── progressState.js         # Resume support via state/ directory
    ├── gatewayManager.js        # IPFS/Arweave gateway rotation
    ├── validation.js            # Input validation
    ├── envValidator.js          # Environment variable checks
    └── logger.js                # Winston logging
```

## Data Flow

1. **Mirror Node** → Fetches token details and NFT serial metadata from Hedera
2. **IPFS Gateways** → Retrieves actual metadata JSON (with retry/failover across 6+ gateways)
3. **Directus** → Stores normalized metadata in TokenStaticData collection
4. **Filebase** → Pins CIDs for reliable IPFS availability

## Key Environment Variables

- `DIRECTUS_DB_URL` - Directus instance URL
- `DIRECTUS_TOKEN` - Static token for Directus auth
- `FILEBASE_PINNING_SERVICE` - Filebase pinning API endpoint
- `FILEBASE_PINNING_API_KEY` - Filebase API key

## Configuration (config.js)

Key settings:
- `processing.maxRetries: 18` - Gateway retry attempts per CID
- `processing.concurrentRequests: 10` - Parallel metadata fetches
- `ipfs.gateways[]` - IPFS gateway rotation list
- `database.writeBatchSize: 50` - Directus batch insert size

## Code Style

- Uses tabs for indentation
- Single quotes for strings
- Trailing commas required in multiline arrays/objects
- Stroustrup brace style
- No inline comments
- ESLint configured in `.eslintrc.json`

## Token Address Format

Always `0.0.XXXXXX` format (Hedera account/token ID format).

## Directus Collections

- **TokenStaticData** - NFT metadata (uid, address, serial, rawMetadata, attributes, etc.)
- **eligibleNfts** - Collections enabled for Lazy dApp features
- **cidDB** - IPFS CID tracking with pin confirmation status
