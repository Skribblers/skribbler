const events = require("events");
const { joinLobby } = require("./auth.js");

class Client extends events {
	/**
	 * @class
	 * @param {Object} [options] - Options the client should use
	 * @param {String} [options.name] - The username the bot should join with
	 * @param {Array} [options.avatar] - The avatar the bot should join with
	 * @param {String} [options.lobbyCode] - The lobby code to join with
	 * @param {Boolean} [options.createPrivateRoom] - If a private room should be created. Not supported with the lobbyCode option.
	 * @param {Number | String} [options.language] - The langauge code to look for servers with. Not needed if a lobby code is set. Can be a number 1-27.
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
			Math.floor(100 * Math.random()) % 51
			-1
		];

		this.options = options;
		this.socket = null;

		this.lobbyId = null;
		this.settings = {};
		this.userId = null;
		this.ownerId = null;
		this.players = [];
		this.time = null;
		this.currentDrawer = null;
		this.availableWords = [];
		this.canvas = [];

		this.init();
	}

	async init() {
		if(this.socket) throw Error("Client has already initialized.");

		const socket = await joinLobby(this.options);
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

					this.time = data.state.time;
					this.currentDrawer = this.players.find(plr => plr.id === data.state.data.id);
					this.canvas = this.canvas.concat(data.state.data.drawCommands);

					this.emit("connected");
					break;
				case 11: {
					if(data.data === 0) this.emit("roundStart");

					this.time = data.time;
					this.currentDrawer = this.players.find(plr => plr.id === data.data.id);

					if(Array.isArray(data.data?.words)) {
						this.availableWords = data.data.words;

						this.emit("chooseWord", data.data.words);
					} else this.availableWords = [];

					if(data.id === 4 && data.data.id === this.currentDrawer.id) this.emit("canDraw");

					break;
				}
				case 12: {
					const setting = Object.keys(this.settings)[data.id];

					this.settings[setting] = data.value;
					break;
				}
				case 13:
					this.emit("hintRevealed", data[0]);
					break;
				case 14:
					this.time = data - 1;
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
					this.canvas = this.canvas.concat(data);

					this.emit("draw", data);
					break;
				case 20:
					this.canvas = [];

					this.emit("clearCanvas");
					break;
				case 30: {
					const player = this.players.find(plr => plr.id === data.id);

					this.emit("text", {
						player: player,
						msg: data.msg
					});
					break;
				}
				default:
					this.emit(id, data);
			}
			this.emit("packet", {id, data});
		});

		const interval = setInterval(() => {
			if(!this.socket.connected) return clearInterval(interval);

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
		if(!this.socket) throw Error("Socket isnt initialized yet.");

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
	 * @description The user to votekick. If the player gets enough votes, they will be kicked.
	 * @param {Number} userId - The ID of the user who will be getting votekicked
	 * @throws
	 */
	votekick(userId) {
		if(typeof userId !== "number") throw TypeError("Expected userId to be type of Number");

		this.sendPacket(5, userId);
	}

	/**
	 * @name imageVote
	 * @description Vote on an image
	 * @param {Number | String} id - Can be either 0, 1, like or dislike
	 * @throws
	 */
	imageVote(id) {
		if(typeof id !== "number" && typeof id !== "string") throw TypeError("Expected id to be type of String or Number");

		if(id === "dislike") id = 0;
			else if(id === "like") id = 1;

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
	 * @param {Number | String} word - The message to send
	 * @throws
	 */
	selectWord(word) {
		if(typeof word !== "number" && typeof word !== "string") throw TypeError("Expected word to be type of Number or String");

		if(isNaN(word)) {
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
	 * @throws
	 */
	startGame(customWords) {
		if(typeof customWords !== "undefined" && !Array.isArray(customWords)) throw TypeError("Expected customWords to be an array");

		this.sendPacket(22, customWords ? customWords.join(", ") : "");
	}

	/**
	 * @name endGame
	 * @description End the game if you are the owner of the private lobby
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
		this.socket.disconnect();
	}
}

module.exports = {
	Client
};
