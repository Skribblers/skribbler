const events = require("events");
const { joinLobby } = require("./auth.js");

class Client extends events {
	/**
	 * @class
	 * @param {Object} [options] - Options the client should use
	 * @param {String} [options.name] - The username the bot should join with
	 * @param {Array} [options.avatar] - The avatar the bot should join with
	 * @param {String} [options.lobbyCode] - The lobby code to join with
	 * @param {Number} [options.language] - The langauge to look for servers with. Not needed if a lobby code is set.
	 * @param {Object} [options.httpHeaders] - HTTP headers to use
	 * @throws {TypeError}
	 */
	constructor(options = {}) {
		super();

		if(typeof options !== "object") throw TypeError("Client options is not an object.");
		if(typeof options.httpHeaders !== "object") options.httpHeaders = {};
		if(!options.language) options.language = 0;

		this.options = options;
		this.socket = null;

		this.lobbyId = null;
		this.settings = {};
		this.userId = null;
		this.ownerId = null;
		this.players = [];

		this.init(options);
	}

	async init(options) {
		if(this.socket) throw Error("Client has already initialized.");

		const { socket } = await joinLobby(options);

		this.socket = socket;

		let disconnectReason;
		let joinErr;
		socket.on("joinerr", (data) => {
			joinErr = data;
		});

		socket.on("reason", (data) => {
			disconnectReason = data;
		});

		socket.on("disconnect", () => {
			this.emit("disconnect", {
				reason: disconnectReason,
				joinErr
			});
		});

		// Start listening for packets
		socket.on("data", ({id, data}) => {
			switch(id) {
				case 1:
					this.players.push(data);
					this.emit("playerJoin", data);
					break;
				case 2: {
					const index = this.players.findIndex(plr => plr.id === data.id);
					const player = this.players.splice(index, 1)[0];

					this.emit("playerLeave", {
						playerId: data.id,
						player: player,
						reason: data.reason
					});
				
					break;
				}
				case 10:
					this.lobbyId = data.id;
					this.settings = {
						language: data.settings[0],
						maxPlayers: data.settings[1],
						maxDrawTime: data.settings[2],
						maxRounds: data.settings[3],
						wordCount: data.settings[4],
						maxHints: data.settings[5],
						wordMode: data.settings[6],
						useCustomWords: data.settings[7] ? true : false
					};

					this.userId = data.me;
					this.ownerId = data.owner;

					this.players = data.users;
					
					this.emit("connected");
					break;
				case 12: {
					const setting = Object.keys(this.settings)[data.id];

					this.settings[setting] = data.value;
					break;
				}
				case 13:
					this.emit("hintRevealed", data[0]);
					break;
				case 15: {
					const player = this.players.find(plr => plr.id === data.id);

					this.emit("playerGuessed", {
						player
					});
					break;
				}
				case 16:
					this.emit("closeWord", data);
					break;
				case 17: {
					const player = this.players.find(plr => plr.id === data.id);
					this.owner = data.id;

					this.emit("newOwner", {
						player
					});
					break;
				}
				case 19:
					this.emit("draw", data);
					break;
				case 20:
					this.emit("clearCanvas");
					break;
				case 30: {
					const player = this.players.find(plr => plr.id === data.id);

					this.emit("text", {
						player: player,
						msg: data.msg
					});
				}
			}

			this.emit("packet", {id, data});
		});
	}

	/**
	 * @name sendPacket
	 * @description Sends a data packet to the server
	 * @param {Number} id - The packet ID
	 * @param {any} data - Packet data to send
	 * @throws
	 */
	sendPacket(id, data) {
		if(!this.socket) throw Error("Socket isnt initialized yet.");

		this.socket.emit("data", {
			id: id,
			data: data
		});
	}

	/**
	 * @name hostKick
	 * @description If you are the host of a lobby, this will kick the player out of the lobby
	 * @param {Number} userId - The ID of the user who will be getting votekicked
	 * @throws
	 */
	hostKick(userId) {
		this.sendPacket(3, userId);
	}

	/**
	 * @name hostBan
	 * @description If you are the host of a lobby, this will ban the player's IP from ever joining that lobby
	 * @param {Number} userId - The ID of the user to ban
	 * @throws
	 */
	hostBan(userId) {
		this.sendPacket(4, userId);
	}

	/**
	 * @name votekick
	 * @description The user to votekick. If the player gets enough votes, they will be kicked.
	 * @param {Number} userId - The ID of the user who will be getting votekicked
	 * @throws
	 */
	votekick(userId) {
		this.sendPacket(5, userId);
	}

	/**
	 * @name imageVote
	 * @description Vote on an image
	 * @param {Number | String} id - Can be either 0, 1, like or dislike
	 * @throws
	 */
	imageVote(id) {
		if(id === "dislike") id = 0;
		if(id === "like") id = 1;

		if(isNaN(id) || id < 0 || id > 1) throw Error("Invalid vote option");

		this.sendPacket(8, id);
	}

	/**
	 * @name clearCanvas
	 * @description Clear the canvas if you are the current drawer
	 * @throws
	 */
	clearCanvas() {
		this.sendPacket(20);
	}

	/**
	 * @name startGame
	 * @description Start the round if you are the owner of the private lobby
	 * @throws
	 */
	startGame() {
		this.sendPacket(22);
	}

	/**
	 * @name sendMessage
	 * @description Send a message in the lobby
	 * @param {String} msg - The message to send
	 * @throws
	 */
	sendMessage(msg) {
		this.sendPacket(30, msg);
	}

	/**
	 * @name disconnect
	 * @description Disconnects you from the lobby
	 * @throws
	 */
	disconnect() {
		this.socket.disconnect();
	}
}

module.exports = {
	Client
};