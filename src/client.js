// @ts-check
const events = require("events");
const { joinLobby } = require("./auth.js");

const Constants = require("./constants.js");

class Client extends events {
	/**
	 * @class
	 * @param {Object} [options] - Options the client should use
	 * @param {String} [options.name] - The username the bot should join with
	 * @param {Array} [options.avatar] - The avatar the bot should join with
	 * @param {String} [options.lobbyCode] - The lobby code to join with
	 * @param {Boolean} [options.createPrivateRoom] - If a private room should be created. Not supported with the lobbyCode option.
	 * @param {Number} [options.language] - The langauge code to look for servers with. Not needed if a lobby code is set. Can be a number 1-27.
	 * @param {string} [options.serverURL] - The server to log into. This can be used in combination with a Proxy or a custom Server
	 * @param {Object} [options.httpHeaders] - HTTP headers to use
	 * @param {Object} [options.socketOptions] - Options to use for socket.io-client
	 * @throws {TypeError}
	 */
	constructor(options = {}) {
		super();

		if(typeof options !== "object") throw TypeError("Client options is not an object.");
		if(typeof options.httpHeaders !== "object") options.httpHeaders = {};

		if(options.createPrivateRoom && options.lobbyCode) throw TypeError("Cannot create a private room with a lobby code.");
		if(!options.language) options.language = 0;

		if(!Array.isArray(options.avatar)) options.avatar = [
			Math.floor(100 * Math.random()) % 26,
			Math.floor(100 * Math.random()) % 57,
			Math.floor(100 * Math.random()) % 51,
			-1
		];

		this.options = options;

		this.init();
	}

	options = {};
	socket = null;
	connected = false;

	lobbyId = null;
	settings = {};

	state = null;
	round = 0;

	userId = null;
	ownerId = null;
	players = [];
	time = 0;
	currentDrawer = null;
	availableWords = [];
	canvas = [];

	async init() {
		if(this.socket) throw Error("Client has already initialized.");

		const socket = await joinLobby(this.options);

		// @ts-expect-error
		this.socket = socket;
		this.connected = true;

		let disconnectReason;
		let joinErr;
		socket.on("joinerr", (data) => {
			joinErr = data;
		});

		socket.on("reason", (data) => {
			disconnectReason = data;
		});

		socket.on("disconnect", () => {
			this.connected = false;

			this.emit("disconnect", {
				reason: disconnectReason,
				joinErr
			});
		});

		// Start listening for packets
		socket.on("data", ({id, data}) => {
			if(data === null) return;

			switch(id) {
				case Constants.Packets.PLAYER_JOIN: {
					if(typeof data !== "object") return console.log(`Received invalid packet. ID: 1.`);

					this.players.push(data);
					this.emit("playerJoin", data);
					break;
				}
				case Constants.Packets.PLAYER_LEAVE: {
					if(
						typeof data?.id !== "number" ||
						typeof data.reason !== "number"
					) return console.log(`Received invalid packet. ID: 2.`);

					const index = this.players.findIndex(plr => plr.id === data.id);
					if(index === -1) break;

					const player = this.players.splice(index, 1)[0];

					this.emit("playerLeave", {
						player: player,
						reason: data.reason
					});

					break;
				}
				case Constants.Packets.VOTE: {
					if(
						typeof data?.id !== "number" ||
						typeof data?.vote !== "number"
					) return console.log(`Received invalid packet. ID: 8.`);

					const player = this.players.find(plr => plr.id === data.id);
					if(!player) break;

					this.emit("vote", {
						player,
						vote: data.vote
					});
					break;
				}
				case Constants.Packets.LOBBY_DATA:
					if(
						!Array.isArray(data?.settings) ||
						!Array.isArray(data?.users)
					) return console.log(`Received invalid packet. ID: 10.`);

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

					this.state = data.state?.id;
					this.round = data.round;

					this.userId = data.me;
					this.ownerId = data.owner;

					this.players = data.users;

					this.time = data.state?.time;
					this.currentDrawer = this.players.find(plr => plr.id === data.state?.data?.id);
					this.canvas = this.canvas.concat(data.state?.data?.drawCommands);

					this.emit("connect");
					break;
				case Constants.Packets.UPDATE_GAME_DATA: {
					if(
						typeof data?.id !== "number" ||
						typeof data?.time !== "number"
					) return console.log(`Received invalid packet. ID: 11.`);

					this.state = data.id;
					this.time = data.time;

					// Handle game state
					switch(data.id) {
						case Constants.GameState.CURRENT_ROUND: {
							if(typeof data.data !== "number") return console.log(`Received invalid packet. ID: 11`);

							// @ts-ignore
							this.round = data.data + 1;

							// Scores are reset
							if(this.round === 0) {
								for(const player of this.players) {
									player.score = 0;
								}
							}

							this.emit("roundStart", this.round);
							break;
						}

						case Constants.GameState.USER_PICKING_WORD: {
							if(typeof data.data?.id !== "number") return console.log(`Received invalid packet. ID: 11`);
							this.currentDrawer = this.players.find(plr => plr.id === data.data.id);

							// Only handle rest of the code if the user can select a word to draw
							if(!Array.isArray(data.data?.words)) break;

							this.availableWords = data.data.words;

							this.emit("chooseWord", this.availableWords);
							break;
						}

						case Constants.GameState.CAN_DRAW: {
							if(typeof data.data !== "object") return console.log(`Received invalid packet. ID: 11`);

							this.canvas = [];
							this.availableWords = [];
							this.currentDrawer = this.players.find(plr => plr.id === data.data?.id);

							if(data.data?.id === this.userId) this.emit("canDraw");
							break;
						}

						case Constants.GameState.DRAW_RESULTS: {
							if(!Array.isArray(data.data?.scores)) return console.log(`Received invalid packet. ID: 11`);

							let counter = 0;
							for(const player of this.players) {
								player.guessed = false;
								player.score = data.data.scores[(counter * 3) + 1];

								counter++;
							}
							break;
						}

						// When a private lobby's game ends, reset all the player's scores
						case Constants.GameState.IN_GAME_WAITING_ROOM: {
							this.canvas = [];
							this.round = 0;

							for(const player of this.players) {
								player.score = 0;
							}
						}
					}
					break;
				}
				case Constants.Packets.UPDATE_SETTINGS: {
					if(
						typeof data?.id !== "number" ||
						typeof data?.val !== "number"
					) return console.log(`Received invalid packet. ID: 12.`);

					const setting = Object.keys(this.settings)[data.id];
					if(!setting) break;

					if(setting === "useCustomWords") data.val = data.val ? true : false;

					this.settings[setting] = data.val;
					break;
				}
				case Constants.Packets.REVEAL_HINT:
					if(!Array.isArray(data)) return console.log(`Received invalid packet. ID: 13.`);

					this.emit("hintRevealed", data);
					break;
				case Constants.Packets.UPDATE_TIME:
					if(typeof data !== "number") return console.log(`Received invalid packet. ID: 14.`);

					this.time = data - 1;
					break;
				case Constants.Packets.PLAYER_GUESSED: {
					if(typeof data?.id !== "number") return console.log(`Received invalid packet. ID: 15.`);

					const player = this.players.find(plr => plr.id === data.id);
					if(!player) break;

					player.guessed = true;

					this.emit("playerGuessed", {
						player,
						// Can be undefined
						word: data.word
					});
					break;
				}
				case Constants.Packets.CLOSE_WORD:
					if(typeof data !== "string") return console.log(`Received invalid packet. ID: 16.`);

					this.emit("closeWord", data);
					break;
				case Constants.Packets.SET_OWNER: {
					if(typeof data !== "number") return console.log(`Received invalid packet. ID: 17.`);

					const player = this.players.find(plr => plr.id === data);
					if(!player) break;

					// @ts-expect-error
					this.ownerId = data;

					this.emit("newOwner", {
						player
					});
					break;
				}
				case Constants.Packets.DRAW:
					this.canvas = this.canvas.concat(data);

					this.emit("draw", data);
					break;
				case Constants.Packets.CLEAR_CANVAS:
					this.canvas = [];

					this.emit("clearCanvas");
					break;
				case Constants.Packets.UNDO: {
					if(typeof data !== "number") return console.log(`Received invalid packet. ID: 21.`);

					this.canvas.splice(data);

					this.emit("undo", data);
					break;
				}
				case Constants.Packets.TEXT: {
					if(
						typeof data?.id !== "number" ||
						typeof data?.msg !== "string"
					) return console.log(`Received invalid packet. ID: 30.`);

					const player = this.players.find(plr => plr.id === data.id);
					if(!player) break;

					this.emit("text", {
						player: player,
						msg: data.msg
					});
					break;
				}
				case Constants.Packets.GAME_START_ERROR: {
					if(typeof data?.id !== "number") return console.log(`Received invalid packet. ID: 31.`);

					this.emit("startError", data.id);
					break;
				}
				default:
					this.emit(id, data);
			}
			this.emit("packet", {id, data});
		});

		const interval = setInterval(() => {
			if(!this.connected) return clearInterval(interval);

			if(this.time && this.time > 0) this.time--;
		}, 1000);
	}

	/**
	 * @name sendPacket
	 * @description Sends a data packet to the server
	 * @param {Number} id - The packet ID
	 * @param {any} [data] - Packet data to send
	 * @throws
	 */
	sendPacket(id, data) {
		// @ts-expect-error
		if(!this.socket?.connected) throw Error("Socket isnt initialized or is disconnected.");

		// @ts-expect-error
		this.socket.emit("data", {
			id,
			data
		});
	}

	/**
	 * @name hostKick
	 * @description If you are the host of a lobby, this will kick the player out of the lobby
	 * @param {Number} userId - The ID of the user who will be getting votekicked
	 * @throws
	 */
	hostKick(userId) {
		if(typeof userId !== "number") throw TypeError("Expected userId to be type of Number");

		this.sendPacket(3, userId);
	}

	/**
	 * @name hostBan
	 * @description If you are the host of a lobby, this will ban the player's IP from ever joining that lobby
	 * @param {Number} userId - The ID of the user to ban
	 * @throws
	 */
	hostBan(userId) {
		if(typeof userId !== "number") throw TypeError("Expected userId to be type of Number");

		this.sendPacket(4, userId);
	}

	/**
	 * @name votekick
	 * @description Votekick a user. If the player gets enough votes, they will be kicked.
	 * @param {Number} userId - The ID of the user who will be getting votekicked
	 * @throws
	 */
	votekick(userId) {
		if(typeof userId !== "number") throw TypeError("Expected userId to be type of Number");

		this.sendPacket(5, userId);
	}

	/**
	 * @name vote
	 * @description Vote on an image
	 * @param {Number | String} id - Can be either 0, 1, like or dislike
	 * @throws
	 */
	vote(id) {
		if(typeof id !== "number" && typeof id !== "string") throw TypeError("Expected id to be type of String or Number");

		if(id === "dislike") id = 0;
			else if(id === "like") id = 1;

		// @ts-expect-error
		if(id < 0 || id > 1) throw Error("Invalid vote option");

		this.sendPacket(8, id);
	}

	/**
	 * @name updateRoomSettings
	 * @description Change the private room settings if you are the owner
	 * @param {String | Number} settingId - ID of the setting to change
	 * @param {String | Number} val - What the value of the setting should be
	 * @throws
	 */
	updateRoomSettings(settingId, val) {
		if(typeof settingId !== "string" && typeof settingId !== "number") throw TypeError("Expected settingId to be type of String or Number");
		if(typeof val !== "string" && typeof settingId !== "number") throw TypeError("Expected val to be type of String or Number");

		this.sendPacket(12, {
			id: String(settingId),
			val: String(val)
		});
	}

	/**
	 * @name selectWord
	 * @description The word to select to draw. You can listen in on the chooseWord event, which provides an array of all the possible words. The exact word or the array index number are accepted
	 * @param {Number | String} word - The word to select
	 * @throws
	 */
	selectWord(word) {
		if(typeof word !== "number" && typeof word !== "string") throw TypeError("Expected word to be type of Number or String");

		if(typeof word === "string") {
			for(let i = 0; i < this.availableWords.length + 1; i++) {
				if(this.availableWords[i] === word) {
					word = i;
					break;
				}
			}
		}

		this.sendPacket(18, word);
	}

	/**
	 * @name draw
	 * @description Draw on the canvas
	 * @param {Array[]} data - Draw Data. If the array has more then 8 items, the server simply ignores the packet
	 * @throws
	 */
	draw(data) {
		if(!Array.isArray(data)) throw TypeError("Expected data to be an array");

		this.canvas = this.canvas.concat(data);

		this.sendPacket(19, data);
	}

	/**
	 * @name clearCanvas
	 * @description Clear the canvas if you are the current drawer
	 * @throws
	 */
	clearCanvas() {
		this.canvas = [];

		this.sendPacket(20);
	}

	/**
	 * @name undo
	 * @description Undo a draw event
	 * @param {Number} [id]
	 * @throws
	 */
	undo(id) {
		if(!id) id = this.canvas.length - 1;

		if(this.canvas.length === 1) return this.clearCanvas();

		this.canvas.splice(id, 1);

		this.sendPacket(21, id);
	}

	/**
	 * @name startGame
	 * @description Start the round if you are the owner of the private lobby
	 * @param {Array} [customWords] - Custom words to use. Note: If there are less then 10 custom words, the server does not use the custom word list
	 * @returns {Promise<Number | String>} startError
	 * @async
	 * @throws
	 */
	async startGame(customWords = []) {
		if(!Array.isArray(customWords)) throw TypeError("Expected customWords to be an array");

		this.sendPacket(22, customWords.join(", "));

		return new Promise((resolve) => {
			let resolved;
			this.once("startError", (error) => {
				resolved = true;
				resolve(error);
			});

			// If we havent recieved a startError event after 2.5 seconds, most likely it succeeded
			setTimeout(() => {
				if(!resolved) resolve("OK");
			}, 2500);
		});
	}

	/**
	 * @name endGame
	 * @description End the game if you are the host of the private lobby
	 * @throws
	 */
	endGame() {
		this.sendPacket(23);
	}

	/**
	 * @name sendMessage
	 * @description Send a message in the lobby
	 * @param {String} msg - The message to send
	 * @throws
	 */
	sendMessage(msg) {
		if(typeof msg !== "string") throw TypeError("Expected msg to be type of String");

		this.sendPacket(30, msg);
	}

	/**
	 * @name disconnect
	 * @description Disconnects you from the lobby
	 * @throws
	 */
	disconnect() {
		// @ts-expect-error
		if(!this.socket?.connected) throw Error("Socket is already disconnected");

		this.connected = false;

		// @ts-expect-error
		this.socket.disconnect();
	}
}

module.exports = {
	Client
};