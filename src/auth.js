// @ts-check
const fetch = require("node-fetch");
const io = require("socket.io-client");
const https = require("https");

/* 



*/

/**
 * @param {Object} options - Options the client should use
 * @param {String} options.name - The username the bot should join with
 * @param {Array} options.avatar - The avatar the bot should join with
 * @param {String} [options.lobbyCode] - The lobby code to join with
 * @param {Boolean} [options.createPrivateRoom] - If a private room should be created. Not supported with the lobbyCode option.
 * @param {Number} [options.language] - The langauge to look for servers with. Not needed if a lobby code is set
 * @param {Object} [options.httpHeaders] - HTTP headers to use
*/
async function joinLobby(options) {
	const headers = {
		"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
		"Accept": "*/*",
		"Accept-Language": "en-US",
		"Accept-Encoding": "gzip, deflate, br",
		"Content-type": "application/x-www-form-urlencoded",
		"Origin": "https://skribbl.io",
		"Connection": "keep-alive",
		"Referer": "https://skribbl.io/",

		...options.httpHeaders,
	};

	// Get server URI
	const body = options.lobbyCode ? `id=${options.lobbyCode}` : `lang=${options.language}`;

	// @ts-expect-error
	const request = await fetch("https://skribbl.io:3000/play", {
    agent: new https.Agent({
      rejectUnauthorized: false,
    }),
		method: "POST",
		headers: {
			...headers,

			"Content-Length": body.length
		},
		body: body
	});

	const serverURI = await request.text();

	headers.Host = serverURI.replace("https://", "");

	// Start websocket connection
	// @ts-expect-error
	const socket = await io(serverURI, {
		reconnection: false
	});

	socket.on("connect", () => {
		socket.emit("login", {
			join: options.lobbyCode ?? (options.createPrivateRoom ? 0 : ""),
			create: options.createPrivateRoom ? 1 : 0,
			name: options.name,
			lang: options.language,
			avatar: options.avatar
		});
	});

	return {
		socket
	};
}

module.exports = {
	joinLobby
};