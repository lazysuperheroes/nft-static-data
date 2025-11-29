/**
 * Logging Configuration
 * Winston-based structured logging with error files
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config');

const logsDir = path.dirname(config.logging.errorLogFile);
if (!fs.existsSync(logsDir)) {
	fs.mkdirSync(logsDir, { recursive: true });
}

const customFormat = winston.format.combine(
	winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
	winston.format.errors({ stack: true }),
	winston.format.splat(),
	winston.format.json(),
);

const consoleFormat = winston.format.combine(
	winston.format.colorize(),
	winston.format.timestamp({ format: 'HH:mm:ss' }),
	winston.format.printf(({ timestamp, level, message, ...meta }) => {
		let msg = `${timestamp} [${level}]: ${message}`;
		if (Object.keys(meta).length > 0) {
			msg += ` ${JSON.stringify(meta)}`;
		}
		return msg;
	}),
);

const transports = [
	new winston.transports.File({
		filename: config.logging.errorLogFile,
		level: 'error',
		format: customFormat,
	}),
	new winston.transports.File({
		filename: config.logging.combinedLogFile,
		format: customFormat,
	}),
];

if (config.logging.consoleOutput) {
	transports.push(
		new winston.transports.Console({
			format: consoleFormat,
			level: config.logging.level,
		}),
	);
}

const logger = winston.createLogger({
	level: config.logging.level,
	transports,
	exitOnError: false,
});

logger.logNFTProcessing = function (tokenId, serial, success, error = null) {
	if (success) {
		this.info('NFT processed successfully', { tokenId, serial });
	}
	else {
		this.error('NFT processing failed', {
			tokenId,
			serial,
			error: error ? error.message : 'Unknown error',
			stack: error ? error.stack : undefined,
		});
	}
};

logger.logPinning = function (cid, name, success, error = null) {
	if (success) {
		this.info('IPFS pinning successful', { cid, name });
	}
	else {
		this.error('IPFS pinning failed', {
			cid,
			name,
			error: error ? error.message : 'Unknown error',
			stack: error ? error.stack : undefined,
		});
	}
};

logger.logDatabaseOperation = function (operation, count, success, error = null) {
	if (success) {
		this.info(`Database ${operation} successful`, { count });
	}
	else {
		this.error(`Database ${operation} failed`, {
			count,
			error: error ? error.message : 'Unknown error',
			stack: error ? error.stack : undefined,
		});
	}
};

module.exports = logger;
