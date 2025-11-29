// @ts-check
const events = require("events");
const { ProxyPlayer } = require("./ProxyPlayer.js");
const { getServerUri } = require("../auth.js");

// Web server
const http = require("http");
const { Server } = require("socket.io");
const { io: clientIo } = require("socket.io-client");

class Proxy extends events {
	/**
	 * @class
	 * @param {Object} [options] - Options the client should use
	 * @param {Number} [options.port] - The port to start the proxy on
	 * @param {String} [options.lobbyCode] - The lobby code to join with
	 * @param {Number} [options.language] - The langauge to look for servers with. Not needed if a lobby code is set
	 * @param {string} [options.serverUrl] - The server to log into. This can be used with a custom Server
	 * @param {Object} [options.httpHeaders] - HTTP headers to use
	 * @throws
	*/
	constructor(options = {}) {
		super();

		if(typeof options !== "object") throw TypeError("Client options is not an object.");

		this.options = options;

		this.init();
	}

	options = {};
	didInit = false;

	async init() {
		if(this.didInit) throw Error("Proxy server has already started");

		this.didInit = true;

		const app = require("express")();
		// @ts-expect-error
		const server = http.createServer(app);

		const io = new Server(server, {
			cors: {
				origin: ["http://skribbl.io", "https://skribbl.io"],
				methods: ["GET", "POST"]
			}
		});

		io.on("connection", (socket) => {
			let loggedIn = false;
			socket.on("login", async (loginData) => {
				// This is to make sure the login packet cannot be spammed in the same socket connection
				if(loggedIn) return;
				loggedIn = true;

				// If the Proxy options does not contain any HTTP headers then we use the headers the client sends to our socket.io server
				const options = {
					httpHeaders: socket.handshake.headers,
					lobbyCode: loginData.join,
					serverUrl: "",

					...this.options
				};

				// Connect to server URI provided in Proxy options or the skribbl.io servers
				const serverUrl = options.serverUrl ?? await getServerUri(options);

				const server = clientIo(serverUrl);

				server.on("connect", () => {
					server.emit("login", loginData);
				});

				const player = new ProxyPlayer(socket, server);

				this.emit("playerJoin", player);
			});
		});

		const port = this.options.port ?? 3000;

		server.listen(port, () => {
			console.log(`Started proxy server on http://localhost:${port}`);
		});
	}
}

module.exports = {
	Proxy,
	ProxyPlayer
};