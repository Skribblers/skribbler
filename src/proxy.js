// @ts-check
const events = require("events");
const { getServerUri } = require("./auth.js");

// Web server
const http = require("http");
const { Server } = require("socket.io");
const { io: clientIo} = require("socket.io-client");

class Proxy extends events {
	/**
	 * @class
	 * @param {Object} [options] - Options the client should use
	 * @param {Number} [options.port] - The port to start the proxy on
	 * @param {String} [options.lobbyCode] - The lobby code to join with
	 * @param {Number} [options.language] - The langauge to look for servers with. Not needed if a lobby code is set
	 * @param {string} [options.serverURL] - The server to log into. This can be used with a custom Server
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
		const server = http.createServer(app);

		const io = new Server(server, {
			cors: {
				origin: ["http://skribbl.io", "https://skribbl.io"],
				methods: ["GET", "POST"]
			}
		});

		io.on("connection", async (socket) => {
			let loginData;
			socket.on("login", (data) => {
				loginData = data;
			});

			const server = await clientIo(await getServerUri(this.options));

			server.on("connect", () => {
				server.emit("login", loginData);
			});

			const player = new ProxyPlayer(socket, server);

			this.emit("playerJoin", player);
		});

		const port = this.options.port ?? 3000;

		server.listen(port, () => {
			console.log(`Started proxy server on http://localhost:${port}`);
		});
	}
}

class ProxyPlayer extends events {
	constructor(client, server) {
		super();

		this.upstream = server;
		this.socket = client;

		this.connected = true;

		this.upstream.on("connect", () => {
			this.emit("connect");
		});

		server.onAny((name, args) => {
			this.emit("incoming", name, args);

			client.emit(name, args);
		});

		client.onAny((name, args) => {
			this.emit("outgoing", name, args);

			server.emit(name, args);
		});

		server.on("disconnect", () => {
			client.disconnect();
			this.connected = false;

			this.emit("disconnect");
		});

		// Client disconnected from proxy
		client.on("disconnect", () => {
			server.disconnect();
		});
	}

	/**
	 * @name sendOutbound
	 * @param {Number} id - Packet ID to send
	 * @param {any} [data] - Packet data to send
	 * @description This function sends a packet to the skribbl.io server
	 */
	sendOutbound(id, data) {
		this.upstream.emit("data", {
			id,
			data
		});
	}

	/**
	 * @name sendInbound
	 * @param {Number} id - Packet ID to send
	 * @param {any} [data] - Packet data to send
	 * @description This function sends a packet to the client
	 */
	sendInbound(id, data) {
		this.socket.emit("data", {
			id,
			data
		});
	}

	/**
	 * @name disconnect
	 * @description Disconnect from the server
	 */
	disconnect() {
		this.connected = false;

		this.upstream.disconnect();
	}
}

module.exports = {
	Proxy
};