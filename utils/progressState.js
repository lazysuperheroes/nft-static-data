/**
 * Progress State Manager
 * Save and load progress to allow resuming interrupted runs
 */

const fs = require('fs').promises;
const path = require('path');
const config = require('../config');

class ProgressStateManager {
	constructor() {
		this.stateDir = config.cache.progressStateDir;
	}

	async ensureStateDir() {
		try {
			await fs.mkdir(this.stateDir, { recursive: true });
		}
		catch (error) {
			console.error('Failed to create state directory:', error);
		}
	}

	getStateFile(tokenId) {
		return path.join(this.stateDir, `${tokenId.replace(/\./g, '_')}-progress.json`);
	}

	async saveProgress(tokenId, data) {
		await this.ensureStateDir();
		const stateFile = this.getStateFile(tokenId);

		const state = {
			tokenId,
			...data,
			timestamp: Date.now(),
			lastUpdated: new Date().toISOString(),
		};

		try {
			await fs.writeFile(stateFile, JSON.stringify(state, null, 2));
			return true;
		}
		catch (error) {
			console.error('Failed to save progress:', error);
			return false;
		}
	}

	async loadProgress(tokenId) {
		const stateFile = this.getStateFile(tokenId);

		try {
			const data = await fs.readFile(stateFile, 'utf8');
			const state = JSON.parse(data);

			if (state.tokenId === tokenId) {
				console.log(`✓ Found saved progress from ${state.lastUpdated}`);
				return state;
			}
		}
		catch (error) {
			return null;
		}

		return null;
	}

	async clearProgress(tokenId) {
		const stateFile = this.getStateFile(tokenId);

		try {
			await fs.unlink(stateFile);
			console.log('✓ Progress state cleared');
			return true;
		}
		catch (error) {
			return false;
		}
	}

	async listProgressStates() {
		await this.ensureStateDir();

		try {
			const files = await fs.readdir(this.stateDir);
			const stateFiles = files.filter(f => f.endsWith('-progress.json'));

			const states = [];
			for (const file of stateFiles) {
				try {
					const data = await fs.readFile(path.join(this.stateDir, file), 'utf8');
					states.push(JSON.parse(data));
				}
				catch (error) {
					console.warn(`Failed to read state file ${file}`);
				}
			}

			return states;
		}
		catch (error) {
			return [];
		}
	}
}

module.exports = ProgressStateManager;
