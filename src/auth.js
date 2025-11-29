// @ts-check
const fetch = require("node-fetch");
const { io } = require("socket.io-client");

const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * @param {Object} [options] - Options the client should use
 * @param {String} [options.lobbyCode] - The lobby code to join with
 * @param {Number} [options.language] - The langauge to look for servers with. Not needed if a lobby code is set
 * @param {string} [options.serverURL] - The server to log into. This can be used in combination with a Proxy or a custom Server
 * @param {Object} [options.httpHeaders] - HTTP headers to use
*/
async function getServerUri(options = {}) {
	// Get server URI
	const body = options.lobbyCode ? `id=${options.lobbyCode}` : `lang=${options.language}`;

	const request = await fetch("https://skribbl.io/api/play", {
		method: "POST",
		headers: {
			"User-Agent": userAgent,
			"Accept": "*/*",
			"Accept-Language": "en-US",
			"Accept-Encoding": "gzip, deflate, br",
			"Content-type": "application/x-www-form-urlencoded",
			"Origin": "https://skribbl.io",
			"Connection": "keep-alive",
			"Referer": "https://skribbl.io/",

			...options.httpHeaders
		},
		body: body
	});

	if(request.status === 503) throw Error("Unable to get server URI. Either you are creating too many clients or skribbl.io is down.");

	const serverUrl = await request.text();

	const url = new URL(serverUrl);

	return {
		hostname: url.protocol + "//" + url.hostname,
		port: url.port
	};
}

/**
 * @param {Object} [options] - Options the client should use
 * @param {String} [options.name] - The username the bot should join with
 * @param {Array<Number>} [options.avatar] - The avatar the bot should join with
 * @param {String} [options.lobbyCode] - The lobby code to join with
 * @param {Boolean} [options.createPrivateRoom] - If a private room should be created. Not supported with the lobbyCode option.
 * @param {Number} [options.language] - The langauge to look for servers with. Not needed if a lobby code is set
 * @param {string} [options.serverURL] - The server to log into. This can be used in combination with a Proxy or a custom Server
 * @param {Object} [options.httpHeaders] - HTTP headers to use
 * @param {Object} [options.socketOptions] - Options to use for socket.io-client
*/
async function joinLobby(options = {}) {
	const { hostname, port } = await getServerUri(options);

	// Start websocket connection
	const socket = io(hostname, {
		extraHeaders: {
			"User-Agent": userAgent,
			"Accept": "*/*",
			"Accept-Language": "en-US",
			"Accept-Encoding": "gzip, deflate, br",
			"Origin": "https://skribbl.io",
			"Connection": "keep-alive",
			"Referer": "https://skribbl.io/",

			...options.httpHeaders,
		},
		reconnection: false,
		transports: ["websocket", "polling"],
		path: "/" + port,

		...options.socketOptions
	});

	socket.on("connect", () => {
		socket.emit("login", {
			join: options.lobbyCode ?? (options.createPrivateRoom ? 0 : ""),
			create: options.createPrivateRoom ? 1 : 0,
			name: options.name ?? "",
			lang: String(options.language),
			avatar: options.avatar
		});
	});

	return socket;
}

module.exports = {
	joinLobby,
	getServerUri
};
