/**
 * Gateway Manager
 * Smart gateway selection based on performance metrics
 */

const logger = require('./logger');

class GatewayManager {
	constructor(gateways, type = 'ipfs') {
		this.type = type;
		this.gateways = gateways.map(url => ({
			url,
			successCount: 0,
			failCount: 0,
			totalResponseTime: 0,
			avgResponseTime: 0,
			lastSuccess: null,
			lastFailure: null,
		}));
	}

	getBestGateway() {
		const now = Date.now();
		const FAILURE_PENALTY_TIME = 60000;

		const scored = this.gateways.map(gateway => {
			const totalAttempts = gateway.successCount + gateway.failCount;
			const successRate = totalAttempts > 0 ? gateway.successCount / totalAttempts : 0.5;

			let timePenalty = 1.0;
			if (gateway.lastFailure && (now - gateway.lastFailure) < FAILURE_PENALTY_TIME) {
				timePenalty = 0.5;
			}

			const responseScore = gateway.avgResponseTime > 0
				? Math.max(0, 1 - (gateway.avgResponseTime / 10000))
				: 0.5;

			const score = (successRate * 0.6 + responseScore * 0.4) * timePenalty;

			return { gateway, score };
		});

		scored.sort((a, b) => b.score - a.score);

		return scored[0].gateway.url;
	}

	recordSuccess(url, responseTime) {
		const gateway = this.gateways.find(g => g.url === url);
		if (gateway) {
			gateway.successCount++;
			gateway.totalResponseTime += responseTime;
			gateway.avgResponseTime = gateway.totalResponseTime / gateway.successCount;
			gateway.lastSuccess = Date.now();

			logger.debug('Gateway success recorded', {
				type: this.type,
				url,
				responseTime,
				avgResponseTime: gateway.avgResponseTime,
				successRate: gateway.successCount / (gateway.successCount + gateway.failCount),
			});
		}
	}

	recordFailure(url) {
		const gateway = this.gateways.find(g => g.url === url);
		if (gateway) {
			gateway.failCount++;
			gateway.lastFailure = Date.now();

			logger.debug('Gateway failure recorded', {
				type: this.type,
				url,
				successRate: gateway.successCount / (gateway.successCount + gateway.failCount),
			});
		}
	}

	getStats() {
		return this.gateways.map(g => ({
			url: g.url,
			successCount: g.successCount,
			failCount: g.failCount,
			avgResponseTime: Math.round(g.avgResponseTime),
			successRate: (g.successCount + g.failCount) > 0
				? ((g.successCount / (g.successCount + g.failCount)) * 100).toFixed(1) + '%'
				: 'N/A',
		}));
	}

	printStats() {
		console.log(`\n📊 Gateway Statistics (${this.type.toUpperCase()}):`);
		console.log('━'.repeat(80));

		const stats = this.getStats();
		stats.forEach(stat => {
			const urlShort = stat.url.length > 50 ? stat.url.substring(0, 47) + '...' : stat.url;
			console.log(`${urlShort.padEnd(50)} | Success: ${String(stat.successCount).padStart(4)} | Fail: ${String(stat.failCount).padStart(4)} | Rate: ${stat.successRate.padStart(6)} | Avg: ${String(stat.avgResponseTime).padStart(5)}ms`);
		});

		console.log('━'.repeat(80));
	}
}

module.exports = GatewayManager;
