// @ts-check
const events = require("events");
const crypto = require("crypto");

const dictionary = require("an-array-of-english-words");

// Web server
const http = require("http");
const { Server: socketServer } = require("socket.io");

const Constants = require("./constants.js");

const lobbies = {};

class Server extends events {
	/**
	 * @class
	 * @param {Object} [options] - Options the client should use
	 * @param {Number} [options.port] - The port to start the server on
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
		if(this.didInit) throw Error("Server has already started");

		this.didInit = true;

		const app = require("express")();
		const server = http.createServer(app);

		const io = new socketServer(server, {
			cors: {
				origin: ["http://skribbl.io", "https://skribbl.io"],
				methods: ["GET", "POST"]
			}
		});

		io.on("connection", async (socket) => {
			let lobbyId;
			let lobbyData;
			const userId = socket.id;

			socket.on("login", (data) => {
				// Validate login packet
				if(
					!Array.isArray(data?.avatar) ||
					(typeof data.join !== "string" && typeof data.join !== "number") ||
					typeof data.create !== "number" ||
					typeof data.name !== "string" ||
					typeof data.lang !== "string" ||
					Number(data.lang) > 27 ||
					typeof data.avatar[0] !== "number" ||
					typeof data.avatar[1] !== "number" ||
					typeof data.avatar[2] !== "number" ||
					typeof data.avatar[3] !== "number"
				) return socket.disconnect(true);

				if(!data.name) data.name = getRandomWords(1)[0];
				data.name.substring(0, 16);

				if(!lobbies[data.lang]) lobbies[data.lang] = {};

				if(Number(data.lang) > 27) data.lang = "0";

				// Try to find a lobby for the user
				if(data.create) {
					lobbyId = createLobby(Constants.LobbyType.PRIVATE, data.lang);

					lobbies[data.lang][lobbyId].owner = userId;
				} else {
					if(data.join.length >= 1) {
						if(lobbies[data.lang][data.join]) lobbyId = data.join;
					} else {
						for(const lobby in lobbies[data.lang]) {
							const lobbyData = lobbies[data.lang][lobby];

							if(lobbyData.type === Constants.LobbyType.PRIVATE && lobbyData.users.length >= lobbyData.settings[1]) continue;

							lobbyId = lobby;
							break;
						}
					}

					// If no lobby was found, then create one for the user
					if(!lobbyId) lobbyId = createLobby(Constants.LobbyType.PUBLIC, data.lang);
				}

				lobbyData = lobbies[data.lang][lobbyId];
				// The reason we check lobbyData's type is because stuff like __proto__ can be passed in as the room code
				// The property does exist on the object, which makes lobbyData valid, but any properties accesed
				// (such as lobbyData.users.length) would result in a crahs
				if(!lobbyData?.users) {
					socket.emit("joinerr", Constants.JoinError.ROOM_NOT_FOUND);
					return socket.disconnect(true);
				}

				if(lobbyData.users.length >= lobbyData.settings[1]) {
					socket.emit("joinerr", Constants.JoinError.ROOM_FULL);
					return socket.disconnect(true);
				}

				socket.join(lobbyId);

				const userData = {
					id: userId,
					name: data.name,
					avatar: data.avatar,
					score: 0,
					guessed: false,
					flags: 0,
					// === Internal Usage ===
					votekicks: 0,
					didVote: false
				};

				lobbyData.users.push(userData);

				socket.in(lobbyId).emit("data", {
					id: Constants.Packets.PLAYER_JOIN,
					data: userData
				});

				socket.emit("data", {
					id: Constants.Packets.LOBBY_DATA,
					data: {
						...lobbyData,

						internal: undefined,
						me: userId
					}
				});
			});

			socket.on("data", (packet) => {
				if(
					typeof packet?.id !== "number" ||
					packet?.data === null
				) return socket.disconnect(true);

				const { id, data } = packet;

				switch(id) {
					case Constants.Packets.HOST_KICK:
					case Constants.Packets.HOST_BAN: {
						if(
							typeof data !== "string" ||
							socket.id !== lobbyData.owner ||
							socket.id !== userId
						) break;

						const index = lobbyData.users.find(usr => usr.id === data);
						if(index === -1) break;

						const LeaveReason = id === Constants.Packets.HOST_KICK ? Constants.LeaveReason.KICKED : Constants.LeaveReason.BANNED;

						io.in(lobbyId).emit("data", {
							id: Constants.Packets.PLAYER_LEAVE,
							data: {
								id: data,
								reason: LeaveReason
							}
						});

						io.in(data).emit("reason", LeaveReason);
						io.in(data).disconnectSockets(true);

						lobbyData.users.splice(index, 1);
						break;
					}

					case Constants.Packets.VOTE: {
						if(
							typeof data !== "number" ||
							data < 0 ||
							data > 1 ||
							lobbyData.state.id !== 4
						) break;

						const player = lobbyData.users.find(usr => usr.id === socket.id);
						if(player.didVote) break;

						player.didVote = true;

						io.in(lobbyId).emit("data", {
							id: Constants.Packets.VOTE,
							data: {
								id: socket.id,
								vote: data
							}
						});
						break;
					}

					case Constants.Packets.UPDATE_SETTINGS: {
						if(
							typeof data?.id !== "string" ||
							typeof data?.val !== "string" ||
							socket.id !== lobbyData.owner,
							lobbyData.state.id !== 7 ||
							data.id < 0 || data.id > lobbyData.settings.length
						) break;

						socket.to(lobbyId).emit("data", {
							id: Constants.Packets.UPDATE_SETTINGS,
							data: {
								id: Number(data.id),
								val: Number(data.val)
							}
						});

						lobbyData.settings[Number(data.id)] = Number(data.val);
						break;
					}

					case Constants.Packets.SELECT_WORD: {
						if(
							typeof data !== "number" ||
							data < 0 ||
							data > lobbyData.settings[4] ||
							socket.id !== lobbyData.state.data.id ||
							lobbyData.state.id !== 3
						) break;

						startGame(lobbyData, io, socket.id, data);
						break;
					}

					case Constants.Packets.DRAW: {
						if(
							socket.id !== lobbyData.state.data.id ||
							!Array.isArray(data) ||
							data.length > 6
						) break;

						console.log(data);

						let invalid = false;
						for(const array of data) {
							if(
								(array.length === 4 || array.length === 7) &&
								typeof array[0] === "number" &&
								typeof array[1] === "number" &&
								typeof array[2] === "number" &&
								typeof array[3] === "number" &&
								(typeof array[4] === "number" || typeof array[4] === "undefined") &&
								(typeof array[5] === "number" || typeof array[5] === "undefined") &&
								(typeof array[6] === "number" || typeof array[6] === "undefined")
							) continue;

							invalid = true;
							break;
						}

						if(invalid) return;

						socket.to(lobbyId).emit("data", {
							id: Constants.Packets.DRAW,
							data: data
						});

						lobbyData.state.data.drawCommands = lobbyData.state.data.drawCommands.concat(data);
						break;
					}

					case Constants.Packets.CLEAR_CANVAS: {
						if(
							socket.id !== lobbyData.state.data.id ||
							lobbyData.state.data.drawCommands.length === 0
						) break;

						socket.in(lobbyId).emit("data", {
							id: Constants.Packets.CLEAR_CANVAS
						});
						break;
					}

					case Constants.Packets.UNDO: {
						if(
							typeof data !== "number" ||
							socket.id !== lobbyData.state.data.id ||
							lobbyData.state.data.drawCommands.length === 0 ||
							data > lobbyData.state.data.drawCommands.length
						) break;

						lobbyData.state.data.drawCommands.splice(data);

						if(lobbyData.state.data.drawCommands.length === 0) {
							socket.to(lobbyId).emit("data", {
								id: Constants.Packets.CLEAR_CANVAS
							});
						} else {
							socket.to(lobbyId).emit("data", {
								id: Constants.Packets.UNDO,
								data
							});
						}
						break;
					}

					case Constants.Packets.REQUEST_GAME_START: {
						if(
							typeof data !== "string" ||
							socket.id !== lobbyData.owner ||
							lobbyData.state.id !== 7
						) break;

						if(lobbyData.users.length < 2) {
							socket.emit("data", {
								id: Constants.Packets.GAME_START_ERROR,
								data: {
									id: Constants.GameStartError.NOT_ENOUGH_PLAYERS
								}
							});
							break;
						}

						io.in(lobbyId).emit("data", {
							id: Constants.Packets.UPDATE_GAME_DATA,
							data: {
								id: Constants.GameState.CURRENT_ROUND,
								time: 2,
								data: lobbyData.round
							}
						});

						setTimeout(() => {
							const drawerId = lobbyData.users[lobbyData.users.length - 1].id;
							lobbyData.state.id = 3;
							lobbyData.state.data.id = drawerId;

							io.in(lobbyId).emit("data", {
								id: Constants.Packets.UPDATE_GAME_DATA,
								data: {
									id: 3,
									time: 15,
									data: {
										id: drawerId
									}
								}
							});

							lobbyData.internal.possibleWords = getRandomWords(lobbyData.settings[4], lobbyData.settings[7], data.split(","));

							io.to(drawerId).emit("data", {
								id: Constants.Packets.UPDATE_GAME_DATA,
								data: {
									id: 3,
									time: 15,
									data: {
										id: drawerId,
										words: lobbyData.internal.possibleWords
									}
								}
							});

							setTimeout(() => {
								if(lobbyData.state.id !== 3) return;

								startGame(lobbyData, io, drawerId);
							}, 15000);
						}, 2000);

						lobbyData.state.time = 2;
						break;
					}

					case Constants.Packets.TEXT: {
						if(typeof data !== "string") break;

						io.in(lobbyId).emit("data", {
							id: Constants.Packets.TEXT,
							data: {
								id: socket.id,
								msg: data.substring(0, 100)
							}
						});
						break;
					}
				}
			});

			socket.on("disconnect", () => {
				if(!userId || !lobbyData?.users) return;

				const index = lobbyData.users.find(usr => usr.id === userId);
				if(index === -1) return;

				lobbyData.users.splice(index, 1);

				socket.to(lobbyId).emit("data", {
					id: Constants.Packets.PLAYER_LEAVE,
					data: {
						id: userId,
						reason: Constants.LeaveReason.DISCONNECT
					}
				});

				if(lobbyData.owner === socket.id) {
					const newOwner = lobbyData.users[0]?.id;

					if(!newOwner) return lobbies[lobbyData.settings[0]][lobbyData.id] = undefined;

					lobbyData.owner = newOwner;

					socket.to(lobbyId).emit("data", {
						id: Constants.Packets.SET_OWNER,
						data: newOwner
					});
				}
			});
		});

		const port = this.options.port ?? 3000;

		server.listen(port, () => {
			console.log(`Started server on http://localhost:${port}`);
		});
	}
}

function getRandomWords(count = 1, useOnlyAdditionalWords = false, additionalWords = []) {
	const words = [];
	const possibleWords = (useOnlyAdditionalWords && additionalWords.length > 10) ? additionalWords : dictionary.concat(additionalWords);

	for(let i = 0; i < count; i++) {
		words.push(possibleWords[Math.floor(Math.random() * possibleWords.length)]);
	}

	return words;
}

function startGame(lobbyData, io, drawerId, selectedWord = 0) {
	lobbyData.internal.currentWord = lobbyData.internal.possibleWords[selectedWord];
	lobbyData.state.id = 4;
	lobbyData.state.data.word = [lobbyData.internal.currentWord.length];

	io.to(lobbyData.id).emit("data", {
		id: Constants.Packets.UPDATE_GAME_DATA,
		data: {
			id: 4,
			time: lobbyData.settings[2],
			data: {
				id: drawerId,
				word: [lobbyData.internal.currentWord.length],
				hints: [],
				drawCommands: []
			}
		}
	});

	io.to(drawerId).emit("data", {
		id: Constants.Packets.UPDATE_GAME_DATA,
		data: {
			id: 4,
			time: lobbyData.settings[2],
			data: {
				id: drawerId,
				word: lobbyData.internal.currentWord
			}
		}
	});
}

function createLobby(type = Constants.LobbyType.PUBLIC, lang = 0) {
	const lobbyId = crypto.randomBytes(8).toString("base64url");

	lobbies[lang][lobbyId] = {
		internal: {
			blockedIps: [],
			customWords: [],
			possibleWords: [],
			currentWord: ""
		},
		settings: [
			lang,
			12,
			80,
			3,
			3,
			2,
			0,
			0
		],
		id: lobbyId,
		type: type,
		owner: -1,
		users: [],
		round: 0,
		state: {
			id: type === Constants.LobbyType.PUBLIC ? 0 : 7,
			time: 0,
			data: {
				id: "",
				word: [],
				hints: [],
				drawCommands: []
			}
		}
	};

	return lobbyId;
}

module.exports = {
	Server
};