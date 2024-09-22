const axios = require('axios');
require('dotenv').config();

const LSH_IPFS_GATEWAY = 'https://lazysuperheroes.myfilebase.com/ipfs/';
const filebasePinningService = process.env.FILEBASE_PINNING_SERVICE;
const filebasePinningApiKey = process.env.FILEBASE_PINNING_API_KEY;

const cidSet = new Set();

const checkPinHttp = async (_cid) => {
	if (cidSet.has(_cid)) {
		return 200;
	}
	try {
		const response = await axios.get(`${LSH_IPFS_GATEWAY}${_cid}`);
		if (response.status >= 200 && response.status < 300) {
			cidSet.add(_cid);
		}
		return response.status;
	}
	catch (error) {
		return error.status;
	}
};

const checkPinStatus = async (_cid) => {
	const response = await axios.get(`${filebasePinningService}?cid=${_cid}&match=iexact`, {
		headers: {
			Authorization: `Bearer ${filebasePinningApiKey}`,
		},
	});
	return response.data?.results;
};

module.exports = { checkPinHttp, LSH_IPFS_GATEWAY, checkPinStatus };