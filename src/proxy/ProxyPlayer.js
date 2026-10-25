// @ts-check
import events from "events";

export class ProxyPlayer extends events {
	/**
	 * @param {import("socket.io").Socket} client
     * @param {import("socket.io-client").Socket} server
	 */
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