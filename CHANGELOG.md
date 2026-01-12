# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - Unreleased

### Added
- **Enhanced error tracking**: Categorized error tracking (fetchMetadata, pinMetadata, pinImage, databaseWrite, gatewayTimeout, invalidCID)
- **Error analysis CLI**: `analyzeErrors.js` parses winston logs and error exports to identify patterns and root causes
- **Filebase management CLI**: Enhanced `checkFileBaseStatus.js` with retry-from-error-export capability
- **Automatic error export**: Upload scripts now export error reports when processing completes with errors
- **Root cause recommendations**: Error analysis generates actionable recommendations for common issues
- **GitHub Actions CI**: Automated linting, testing, and build verification on push/PR
- **Unit test suite**: 88 tests covering ProcessingContext, CID validation, error analysis, and Filebase integration

### Changed
- ProcessingContext now tracks errors by category with full details (CID, gateway, retry count)
- Error summary included in completion logs
- Filebase status checker integrates with error export files for targeted pin retry

## [1.0.0] - 2025-01-12

### Added
- **Multi-schema support**: Switch between `TokenStaticData` (Lazy dApp) and `SecureTradeMetadata` (Marketplace) via `DB_SCHEMA` environment variable
- **ProcessingContext**: Isolated state per processing job enabling concurrent processing without state collision
- **Schema Adapter**: Normalized metadata format with automatic field mapping between schemas
- **Secure credential storage**: OS keychain integration via keytar (Windows Credential Manager, macOS Keychain, Linux Secret Service)
- **Credential management CLI**: `manageCredentials.js` for secure credential setup and migration
- **CID cache preload**: Automatically preloads CID cache from database before processing to reduce lookups
- **NPM package structure**: Clean exports via `index.js`, CLI commands via `bin`, proper `exports` field
- **Verbose mode**: `--verbose` / `-v` flag to display masked credentials (shows first 2 and last 2 characters)
- **Dry run mode**: `--dry-run` / `-d` flag to simulate operations without database writes
- **Resume capability**: `--resume` / `-r` flag to continue interrupted uploads
- **Comprehensive documentation**: Extended README with configuration guide, forking instructions, and security best practices
- **MIT License**

### Changed
- Refactored `metadataScrapeHelper.js` to use ProcessingContext instead of global mutable state
- Updated all entry points to use async `validateEnvironment()` with keychain support
- Improved error handling and logging throughout

### Fixed
- **Critical**: Fixed XOR bug in backoff calculation (`depth ^ 2` changed to `depth ** 2` for proper exponentiation)
- Added null check in `extractCIDFromUrl()` to prevent errors on undefined URLs

### Security
- Credentials can now be stored in OS keychain instead of plaintext `.env` files
- Masked credential display prevents accidental exposure in logs
- Added security best practices documentation

## [0.x.x] - Previous Versions

Prior versions were not formally tracked. This represents the first official release with proper versioning.
