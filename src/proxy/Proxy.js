// @ts-check
import events from "events";
import { ProxyPlayer } from "./ProxyPlayer.js";
import { getServerUri } from "../auth.js";

// Web server
import http from "http";
import { Server } from "socket.io";
import clientIo from "socket.io-client";

export class Proxy extends events {
	/**
	 * @class
	 * @param {Object} [options] - Options the client should use
	 * @param {Number} [options.port] - The port to start the proxy on
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

		this.server = http.createServer();

		this.io = new Server(this.server, {
			cors: {
				origin: ["http://skribbl.io", "https://skribbl.io"],
				methods: ["GET", "POST"]
			}
		});

		this.io.on("connection", (socket) => {
			let loggedIn = false;
			socket.on("login", async (loginData) => {
				// Make sure the login packet cannot be spammed in the same socket connection
				if(loggedIn) return;
				loggedIn = true;

				// Connect to server URI provided in Proxy options or the skribbl.io servers
				// @ts-expect-error
				let serverUrl = this.options.serverUrl;
				let path;

				if(!serverUrl) {
					const { hostname, port } = await getServerUri({
						language: loginData.langauge,
						lobbyCode: loginData.join,

						...this.options
					});

					serverUrl = hostname;
					path = port;
				}

				const server = clientIo(serverUrl, {
					// @ts-expect-error
					path: this.options.serverUrl ? undefined : ("/" + path),
				});

				server.on("connect", () => {
					server.emit("login", loginData);
				});

				const player = new ProxyPlayer(socket, server);

				this.emit("playerJoin", player);
			});
		});

		// @ts-expect-error
		const port = this.options.port ?? 3000;

		this.server.listen(port, () => {
			console.log(`Started proxy server on http://localhost:${port}`);
		});
	}

	close() {
		this.server?.close();
		this.io?.close();
	}
}