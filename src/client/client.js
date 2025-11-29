// @ts-check
const events = require("events");
const { ClientPlayer } = require("./ClientPlayer.js");
const { joinLobby } = require("../auth.js");

const { Packets, GameState, Vote } = require("../constants.js");

class Client extends events {
	/**
	 * @class
	 * @param {Object} [options] - Options the client should use
	 * @param {String} [options.name] - The username the bot should join with
	 * @param {Array<Number>} [options.avatar] - The avatar the bot should join with
	 * @param {String} [options.lobbyCode] - The lobby code to join with
	 * @param {Boolean} [options.createPrivateRoom] - If a private room should be created. Not supported with the lobbyCode option.
	 * @param {Number} [options.language] - The langauge code to look for servers with. Not needed if a lobby code is set. Can be a number 1-27.
	 * @param {string} [options.serverURL] - The server to log into. This can be used in combination with a Proxy or a custom Server
	 * @param {Object} [options.httpHeaders] - HTTP headers to use
	 * @param {Object} [options.socketOptions] - Options to use for socket.io-client
	 * @throws {Error | TypeError}
	 */
	constructor(options = {}) {
		super();

		if(typeof options !== "object") throw TypeError("Client options is not an object.");
		if(options.createPrivateRoom && options.lobbyCode) throw Error("Cannot create a private room with a lobby code.");
		
		options.httpHeaders ??= {};
		options.language ??= 0;
		options.avatar ??= [
			Math.floor(Math.random() * 26),
			Math.floor(Math.random() * 57),
			Math.floor(Math.random() * 51),
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

	lobbyType = null;

	/**
	 * @type {ClientPlayer[]}
	 */
	players = [];
	time = 0;
	/**
	 * @type {ClientPlayer | null}
	 */
	currentDrawer = null;
	/**
	 * @type {Array<String>}
	 */
	availableWords = [];
	/**
	 * @type {Array<Number>}
	 */
	canvas = [];
	word = "";

	async init() {
		if(this.socket) throw Error("Client has already initialized.");

		const socket = await joinLobby(this.options);

		// @ts-expect-error
		this.socket = socket;
		this.connected = true;

		let disconnectReason = "";
		let joinErr = "";
		socket.on("joinerr", (data) => {
			joinErr = data;
		});

		socket.on("reason", (data) => {
			disconnectReason = data;
		});

		socket.on("disconnect", (transportDisconnectReason) => {
			this.connected = false;

			this.emit("disconnect", {
				reason: disconnectReason,
				joinErr,
				transportDisconnectReason
			});
		});

		// Start listening for packets
		socket.on("data", (message) => {
			// Make sure 'id' exist on the data event to prevent a crash from trying to destructure an invalid type
			if(!message?.id) return;

			const { id, data } = message;
			if(data === null) return;

			switch(id) {
				case Packets.PLAYER_JOIN: {
					if(typeof data !== "object") return console.log(`Received invalid packet. ID: 1.`);

					const player = new ClientPlayer(data, this);

					this.players.push(player);
					this.emit("playerJoin", player);
					break;
				}

				case Packets.PLAYER_LEAVE: {
					if(
						typeof data?.reason !== "number"
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

				case Packets.VOTEKICK: {
					if(
						!Array.isArray(data) ||
						typeof data[0] !== "number" ||
						typeof data[1] !== "number" ||
						typeof data[2] !== "number" ||
						typeof data[3] !== "number"
					) return console.log(`Received invalid packet. ID: 2.`);

					// Get the player that voted to kick, and who they voted for
					const voter = this.players.find(plr => plr.id === data[0]);
					const votee = this.players.find(plr => plr.id === data[1]);
					if(!voter) break;
					if(!votee) break;

					this.emit("votekick", {
						voter,
						votee,
						currentVotes: data[2],
						requiredVotes: data[3]
					});
					break;
				}

				case Packets.VOTE: {
					if(
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

				case Packets.UPDATE_AVATAR: {
					if(
						typeof data?.id !== "number"
					) return console.log(`Received invalid packet. ID: 9.`);

					const player = this.players.find(plr => plr.id === data.id);
					if(!player) break;

					player.avatar = data.avatar;
					break;
				}

				case Packets.LOBBY_DATA: {
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
					this.round = data.round + 1;

					this.userId = data.me;
					this.ownerId = data.owner;

					this.lobbyType = data.type;

					this.players = data.users;

					this.time = data.state?.time;
					this.currentDrawer = this.players.find(plr => plr.id === data.state?.data?.id) ?? null;
					this.canvas = data.state?.data?.drawCommands ?? [];

					if(Array.isArray(data.state?.data?.word)) {
						for(const length of data.state.data.word) {
							this.word += `${"_".repeat(length)} `;
						}

						this.word = this.word.trim();
					}

					if(Array.isArray(data.state?.data?.hints)) {
						const characters = this.word.split("");

						for(const hint of data.state.data.hints) {
							if(!Array.isArray(hint)) continue;

							characters[hint[0]] = hint[1];
						}

						this.word = characters.join("");
					}

					this.emit("connect");
					break;
				}

				case Packets.UPDATE_GAME_STATE: {
					if(
						typeof data?.id !== "number" ||
						typeof data?.time !== "number"
					) return console.log(`Received invalid packet. ID: 11.`);

					this.state = data.id;
					this.time = data.time;

					// Handle game state
					switch(data.id) {
						// Pass through
						case GameState.GAME_STARTING_SOON:
						case GameState.WAITING_FOR_PLAYERS: {
							this.emit("stateUpdate", {
								state: data.id
							});
							break;
						}

						case GameState.CURRENT_ROUND: {
							if(typeof data.data !== "number") return console.log(`Received invalid packet. ID: 11`);

							// @ts-ignore
							this.round = data.data + 1;

							// Scores are reset
							if(this.round === 1) {
								for(const player of this.players) {
									player.score = 0;
								}
							}

							this.emit("stateUpdate", {
								state: data.id,
								round: this.round
							});
							break;
						}

						case GameState.USER_PICKING_WORD: {
							if(typeof data.data?.id !== "number") return console.log(`Received invalid packet. ID: 11`);

							this.word = "";

							this.currentDrawer = this.players.find(plr => plr.id === data.data.id) ?? null;
							this.availableWords = data.data.words;

							this.emit("stateUpdate", {
								state: data.id,
								drawer: this.currentDrawer,
								// The following field will be undefined if the Client is not the one who will be drawing
								words: this.availableWords
							});
							break;
						}

						case GameState.CAN_DRAW: {
							if(typeof data.data !== "object") return console.log(`Received invalid packet. ID: 11`);

							this.canvas = [];
							this.availableWords = [];
							this.currentDrawer = this.players.find(plr => plr.id === data.data?.id) ?? null;

							if(Array.isArray(data.data.word)) {
								for(const length of data.data.word) {
									this.word += `${"_".repeat(length)} `;
								}

								this.word = this.word.trim();
							} else {
								this.word = data.data.word;
							}

							this.emit("stateUpdate", {
								state: data.id,
								drawer: this.currentDrawer,
								word: this.word
							});
							break;
						}

						case GameState.DRAW_RESULTS: {
							if(!Array.isArray(data.data?.scores)) return console.log(`Received invalid packet. ID: 11`);

							this.word = data.data.word;

							const stateUpdate = {
								state: data.id,
								reason: data.data.reason,
								word: data.data.word,
								newScores: {}
							};

							let counter = 0;
							for(const player of this.players) {
								player.guessed = false;
								player.score = data.data.scores[(counter * 3) + 1];

								// @ts-ignore
								stateUpdate.newScores[player.name] = player.score;

								counter++;
							}

							this.emit("stateUpdate", stateUpdate);
							break;
						}

						case GameState.GAME_RESULTS: {
							if(!Array.isArray(data.data)) return console.log(`Received invalid packet. ID: 11`);

							const leaderboard = [];

							for(const player of data.data) {
								if(!Array.isArray(player)) break;

								/**
								 * player[0] = Player ID
								 * player[1] = Leaderboard position
								 * player[2] = Unknown
								 */
								leaderboard[player[1]] = this.players.find(plr => plr.id === player[0]);
							}

							this.emit("stateUpdate", {
								state: data.id,
								leaderboard
							});
							break;
						}

						// When a private lobby's game ends, reset all the player's scores
						case GameState.IN_GAME_WAITING_ROOM: {
							this.canvas = [];
							this.round = 0;

							for(const player of this.players) {
								player.score = 0;
							}

							this.emit("stateUpdate", {
								state: data.id
							});
						}
					}
					break;
				}

				case Packets.UPDATE_SETTINGS: {
					if(
						typeof data?.id !== "number" ||
						typeof data?.val !== "number"
					) return console.log(`Received invalid packet. ID: 12.`);

					const setting = Object.keys(this.settings)[data.id];
					if(!setting) break;

					if(setting === "useCustomWords") data.val = data.val ? true : false;

					// @ts-ignore
					this.settings[setting] = data.val;
					break;
				}

				case Packets.REVEAL_HINT: {
					if(!Array.isArray(data)) return console.log(`Received invalid packet. ID: 13.`);

					const characters = this.word.split("");
					for(const hint of data) {
						if(!Array.isArray(hint)) continue;

						/**
						 * hint[0] is the position of the word where the letter belongs
						 * hint[1] is the letter
						 */
						characters[hint[0]] = hint[1];
					}

					this.word = characters.join("");

					this.emit("hintRevealed", data);
					break;
				}

				case Packets.UPDATE_TIME: {
					if(typeof data !== "number") return console.log(`Received invalid packet. ID: 14.`);

					this.time = data - 1;
					break;
				}

				case Packets.PLAYER_GUESSED: {
					if(typeof data?.id !== "number") return console.log(`Received invalid packet. ID: 15.`);

					const player = this.players.find(plr => plr.id === data.id);
					if(!player) break;

					player.guessed = true;

					if(data.word) this.word = data.word;

					this.emit("playerGuessed", {
						player,
						// Can be undefined
						word: data.word
					});
					break;
				}

				case Packets.CLOSE_WORD: {
					if(typeof data !== "string") return console.log(`Received invalid packet. ID: 16.`);

					this.emit("closeWord", data);
					break;
				}

				case Packets.SET_OWNER: {
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

				case Packets.DRAW: {
					this.canvas.push(...data);

					this.emit("draw", data);
					break;
				}

				case Packets.CLEAR_CANVAS: {
					this.canvas = [];

					this.emit("clearCanvas");
					break;
				}

				case Packets.UNDO: {
					if(typeof data !== "number") return console.log(`Received invalid packet. ID: 21.`);

					this.canvas.splice(data);

					this.emit("undo", data);
					break;
				}

				case Packets.TEXT: {
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

				case Packets.GAME_START_ERROR: {
					if(typeof data?.id !== "number") return console.log(`Received invalid packet. ID: 31.`);

					this.emit("startError", {
						reason: data.id,
						// The following field is only sent if the start error reason is 100
						time: data.data
					});
					break;
				}

				case Packets.UPDATE_NAME: {
					if(
						typeof data?.id !== "number"
					) return console.log(`Received invalid packet. ID: 90.`);

					const player = this.players.find(plr => plr.id === data.id);
					if(!player) break;

					player.name = data.name;
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
		if(!this.connected) throw Error("Socket isn't initialized or is disconnected");

		// @ts-expect-error
		this.socket.emit("data", {
			id,
			data
		});
	}

	/**
	 * @name vote
	 * @description Vote on an image
	 * @param {Vote} voteType - The type of vote
	 * @throws
	 */
	vote(voteType) {
		this.sendPacket(Packets.VOTE, voteType);
	}

	/**
	 * @name updateRoomSettings
	 * @description Change the private room settings if you are the owner
	 * @param {String | Number} settingId - ID of the setting to change
	 * @param {String | Number} val - What the value of the setting should be
	 * @throws
	 */
	updateSetting(settingId, val) {
		if(this.userId !== this.ownerId) throw Error("Client#updateSetting can only be used if you're the host");

		if(typeof settingId !== "string" && typeof settingId !== "number") throw TypeError("Expected settingId to be type of String or Number");
		if(typeof val !== "string" && typeof settingId !== "number") throw TypeError("Expected val to be type of String or Number");

		this.sendPacket(Packets.UPDATE_SETTINGS, {
			id: String(settingId),
			val: String(val)
		});
	}

	/**
	 * @name selectWord
	 * @description The word to select to draw. You can listen to the stateUpdate event and wait for a state id of 3. The event will provide an array of all the possible words. The exact word or the array index number are accepted
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

		this.sendPacket(Packets.SELECT_WORD, word);
	}

	/**
	 * @name draw
	 * @description Draw on the canvas
	 * @param {Array<Number>} data - Draw commands to send. If the array has more then 8 items, the server simply ignores the packet
	 * @throws
	 */
	draw(data) {
		if(!Array.isArray(data)) throw TypeError("Expected data to be an array");

		this.canvas.push(...data);

		this.sendPacket(Packets.DRAW, data);
	}

	/**
	 * @name clearCanvas
	 * @description Clear the canvas if you are the current drawer
	 * @throws
	 */
	clearCanvas() {
		this.canvas = [];

		this.sendPacket(Packets.CLEAR_CANVAS);
	}

	/**
	 * @name undo
	 * @description Undo a draw event
	 * @param {Number} [id]
	 * @throws
	 */
	undo(id) {
		if(this.canvas.length === 1) return this.clearCanvas();

		id ??= this.canvas.length - 1;

		this.canvas.splice(id, 1);

		this.sendPacket(Packets.UNDO, id);
	}

	/**
	 * @name startGame
	 * @description Start the game if you are the owner of the private lobby
	 * @param {Array<String>} [customWords] - Custom words to use. Note: If there are less then 10 custom words, the server does not use the custom word list
	 * @returns {Promise<Number | String>} startError
	 * @async
	 * @throws
	 */
	async startGame(customWords = []) {
		if(this.userId !== this.ownerId) throw Error("Client#startGame can only be used if you're the host");

		if(!Array.isArray(customWords)) throw TypeError("Expected customWords to be an array");

		this.sendPacket(Packets.START_GAME, customWords.join(", "));

		return new Promise((resolve) => {
			let resolved = false;
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
		if(this.userId !== this.ownerId) throw Error("Client#endGame can only be used if you're the host");

		this.sendPacket(Packets.END_GAME);
	}

	/**
	 * @name sendMessage
	 * @description Send a message in the lobby
	 * @param {String} msg - The message to send
	 * @throws
	 */
	sendMessage(msg) {
		if(typeof msg !== "string") throw TypeError("Expected msg to be type of String");

		this.sendPacket(Packets.TEXT, msg);
	}

	/**
	 * @name disconnect
	 * @description Disconnects you from the lobby
	 * @throws
	 */
	disconnect() {
		if(!this.connected) throw Error("Socket is already disconnected");

		// @ts-expect-error
		this.socket.disconnect();
	}
}

module.exports = {
	Client,
	ClientPlayer
};