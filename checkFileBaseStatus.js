const axios = require('axios');
const readlineSync = require('readline-sync');
require('dotenv').config();

const filebasePinningService = process.env.FILEBASE_PINNING_SERVICE;
const filebasePinningApiKey = process.env.FILEBASE_PINNING_API_KEY;

console.log('Checking Filebase status...', filebasePinningService);

const values = ['queued', 'pinning', 'pinned', 'failed', 'cid', 'delete', 'delete all failed'];
const query = readlineSync.keyInSelect(values, 'Which query type?');

let url = filebasePinningService;

const queryType = values[query];

if (queryType === 'delete') {
	const requestId = readlineSync.question('Enter Request ID: ');
	url += `/${requestId}`;
	axios.delete(url, {
		headers: {
			Authorization: `Bearer ${filebasePinningApiKey}`,
		},
	}).then((response) => {
		console.log(requestId, response.statusText);
	}).catch((error) => {
		console.error(error);
	});
}
else if (queryType === 'delete all failed') {
	// Call the function to start the process
	checkAndDeleteFailedPins();
}
else {
	if (queryType === 'cid') {
		const cid = readlineSync.question('Enter CID: ');
		url += `?cid=${cid}`;
	}
	else {
		url += `?status=${queryType}&limit=100`;
	}

	axios.get(url, {
		headers: {
			Authorization: `Bearer ${filebasePinningApiKey}`,
		},
	}).then((response) => {
		// console.log(response.data.results);
		for (const item of response.data.results) {
			console.log(item.requestid, item.status, item.pin.cid, `${filebasePinningService}/${item.requestid}`);
			// axios.delete(`${filebasePinningService}/${item.requestid}`, {
			// 	headers: {
			// 		Authorization: `Bearer ${filebasePinningApiKey}`,
			// 	},
			// }).then((delResp) => {
			// 	console.log(delResp);
			// }).catch((error) => {
			// 	console.error(error);
			// });
		}
		console.log(response.data.count);
	}).catch((error) => {
		console.error(error);
	});
}

async function checkAndDeleteFailedPins() {
	let hasMore = true;

	while (hasMore) {
		try {
			const response = await axios.get(`${filebasePinningService}?status=failed&limit=100`, {
				headers: {
					Authorization: `Bearer ${filebasePinningApiKey}`,
				},
			});

			const results = response.data.results;
			if (results.length === 0) {
				hasMore = false;
				break;
			}

			for (const item of results) {
				try {
					const delResp = await axios.delete(`${filebasePinningService}/${item.requestid}`, {
						headers: {
							Authorization: `Bearer ${filebasePinningApiKey}`,
						},
					});
					console.log(item.requestid, delResp.statusText);
				}
				catch (error) {
					console.error(error);
				}
			}

			console.log(response.data.count);
		}
		catch (error) {
			console.error(error);
			hasMore = false;
		}
	}
}


// Golden HH: Z2lkOi8vZmlsZWJhc2UvQXNzZXQvMTUxMDE0OTE4MQ bafkreie625ucklhyqwxqvopoc3aa6dmliji3xwagr3tfkziew3m2xdnd3i

/*
Z2lkOi8vZmlsZWJhc2UvQXNzZXQvMTUwOTQ0MDUxNw failed bafyreiajfkms5peu4rofyxyotljtzu7jmvuxff2lhclzxrmqhhk6pcnmo
Z2lkOi8vZmlsZWJhc2UvQXNzZXQvMTUwOTQ0MDUxOA failed bafyreiask37rdwbacn4cmvrsid6m3iox5hlv5r7wmxrysiow3s7v2phv7
Z2lkOi8vZmlsZWJhc2UvQXNzZXQvMTUwOTQ0MDUxOQ failed bafyreigua445eyw53vnsj6igofkybeuzjkjusk7xeuzpmwdhjpgtg2ufy
Z2lkOi8vZmlsZWJhc2UvQXNzZXQvMTUwOTQ0MDUyMA failed bafyreidtwwhi334ti3dxm4lwptt4jmxczbrkz6riol6uzuyhr3u2f3n6n
Z2lkOi8vZmlsZWJhc2UvQXNzZXQvMTUwOTQ0MDUyMQ failed bafyreibmxpzl6e55yacnvzdbhheqfob2pjkia37asyz2dhxb3klygasf5
Z2lkOi8vZmlsZWJhc2UvQXNzZXQvMTUwOTQ0MDUyMg failed bafyreicy2ussfdprpx3d3sfjodurw3tmgogyyxwl52dwdk2rxkawoinqc
Z2lkOi8vZmlsZWJhc2UvQXNzZXQvMTUwOTQ0MDUyMw failed bafyreighzeghcbpggu24l6dqwyj7fcpmtapovyr3jar6zysfuvknim5wu
Z2lkOi8vZmlsZWJhc2UvQXNzZXQvMTUwOTQ0MDUyNA failed bafyreiaoxl46jy73ph3yx3b63bvvmauqpvzmouqosu4hhjmbhm67z5cyz
Z2lkOi8vZmlsZWJhc2UvQXNzZXQvMTUwOTQ0MDUyNQ failed bafyreig47sfsbtkgh44pneitm2idkstgw4uampx5c6ymu3kcetuttjpu2
Z2lkOi8vZmlsZWJhc2UvQXNzZXQvMTUwOTQ0MDUyNg failed bafyreifabv7ps6wzm2kdoxemmpui32nu27cqknb63azfqclhvtn2oevd6
*/

// axios.delete(`${filebasePinningService}/Z2lkOi8vZmlsZWJhc2UvQXNzZXQvMTUwOTQ0MDUxNw`, {
// 	headers: {
// 		Authorization: `Bearer ${filebasePinningApiKey}`,
// 	},
// }).then((delResp) => {
// 	console.log(delResp);
// }).catch((error) => {
// 	console.error(error.status);
// });