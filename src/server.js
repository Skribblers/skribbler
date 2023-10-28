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
	 * @param {Boolean} [options.reverseDrawOrder] - Should the draw order be reversed 
	 * @param {Object} [options.defaultSettings] - Default settings for each lobby
	 * @param {Number} [options.defaultSettings.maxPlayerCount] - Default max player count
	 * @param {Number} [options.defaultSettings.maxDrawTime] - Default max draw time
	 * @param {Number} [options.defaultSettings.totalRounds] - Default max rounds
	 * @param {Number} [options.defaultSettings.wordCount] - Default word count for each player
	 * @param {Number} [options.defaultSettings.wordMode] - Default word mode. As of now, only 0 and 1 are supported
	 * @throws
	*/
	constructor(options = {}) {
		super();

		if(!options.defaultSettings) options.defaultSettings = {};

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
					lobbyId = createLobby(this.options, Constants.LobbyType.PRIVATE, data.lang, io);

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
					if(!lobbyId) lobbyId = createLobby(this.options, Constants.LobbyType.PUBLIC, data.lang, io);
				}

				lobbyData = lobbies[data.lang][lobbyId];
				// The reason we check lobbyData's type is because stuff like __proto__ can be passed in as the room code
				// The property does exist on the object, which makes lobbyData valid, but any properties accesed
				// (such as lobbyData.users.length) would result in a crahs
				if(!lobbyData?.users) {
					socket.emit("joinerr", Constants.JoinError.ROOM_NOT_FOUND);
					return socket.disconnect(true);
				}

				if(lobbyData.internal.blockedIps.includes(socket.handshake.address)) {
					socket.emit("joinerr", Constants.JoinError.BANNED_FROM_ROOM);
					return socket.disconnect(true);
				}

				if(lobbyData.users.length >= lobbyData.settings[1]) {
					socket.emit("joinerr", Constants.JoinError.ROOM_FULL);
					return socket.disconnect(true);
				}

				socket.join(lobbyId);

				lobbyData.internal.ipMap[userId] = socket.handshake.address;

				const userData = {
					id: userId,
					name: data.name,
					avatar: data.avatar,
					score: 0,
					guessed: false,
					flags: 0,
					// === Internal Usage ===
					votekicks: 0,
					didVoteKick: false,
					didVote: false,
					hasDrawn: false
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

				if(lobbyData.state.id === Constants.GameState.WAITING_FOR_PLAYERS && lobbyData.users.length > 1) {
					lobbyData.state.id = 2;
					lobbyData.state.time = 2;

					io.to(lobbyId).emit("data", {
						id: Constants.Packets.UPDATE_GAME_DATA,
						data: {
							id: Constants.GameState.CURRENT_ROUND,
							time: 2,
							data: lobbyData.round
						}
					});
				}
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

						const LeaveReason = id === Constants.Packets.HOST_BAN ? Constants.LeaveReason.BANNED : Constants.LeaveReason.KICKED;

						io.to(lobbyId).emit("data", {
							id: Constants.Packets.PLAYER_LEAVE,
							data: {
								id: data,
								reason: LeaveReason
							}
						});

						io.to(data).emit("reason", LeaveReason);
						io.to(data).disconnectSockets(true);

						if(id === Constants.Packets.HOST_BAN) {
							lobbyData.internal.blockedIps.push(lobbyData.internal.ipMap[data]);
						}
						break;
					}

					case Constants.Packets.VOTEKICK: {
						if(
							(typeof data !== "string")
						) break;

						const player = lobbyData.users.find(usr => usr.id === socket.id);
						if(player.didVoteKick) break;

						const votedPlayer = lobbyData.users.find(usr => usr.id === data);
						if(!votedPlayer) break;

						votedPlayer.votekicks++;
						const minVotesBeforeKick = Math.ceil((lobbyData.users.length / 2) + 1);

						// Send packet to every user except the person getting vote kicked
						for(const user of lobbyData.users) {
							if(user.id === votedPlayer.id) continue;

							io.to(user.id).emit("data", {
								id: Constants.Packets.VOTEKICK,
								data: [
									socket.id, // Voter's Player ID
									votedPlayer.id, // Voted Player's ID
									votedPlayer.votekicks, // Current amount of votes
									minVotesBeforeKick, // Votes until player kicked
								]
							});
						}

						// Only continue if the player has enough votes to be kicked
						if(minVotesBeforeKick > votedPlayer.votekicks) break;

						io.to(lobbyId).emit("data", {
							id: Constants.Packets.PLAYER_LEAVE,
							data: {
								id: data,
								reason: Constants.LeaveReason.KICKED
							}
						});
	
						io.to(data).emit("reason", Constants.LeaveReason.KICKED);
						io.to(data).disconnectSockets(true);
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

						io.to(lobbyId).emit("data", {
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
							// For some odd reason the skribbl.io client sends this values as Strings instead of a Numver
							typeof data?.id !== "string" ||
							(typeof data?.val !== "string" && typeof data?.val !== "number") ||
							socket.id !== lobbyData.owner ||
							lobbyData.state.id !== Constants.GameState.IN_GAME_WAITING_ROOM ||
							// Check if the setting exists
							data.id < 0 ||
							data.id > 7 ||
							// Make sure setting value isn't out of bounds
							data.val < Constants.SettingsMinValue[data.id] ||
							data.val > Constants.SettingsMaxValue[data.id]
						) break;

						const id = Number(data.id);
						const val = Number(data.val);

						if(
							isNaN(id) ||
							isNaN(val)
						) break;

						socket.to(lobbyId).emit("data", {
							id: Constants.Packets.UPDATE_SETTINGS,
							data: {
								id,
								val
							}
						});

						lobbyData.settings[id] = val
						break;
					}

					case Constants.Packets.SELECT_WORD: {
						if(
							typeof data !== "number" ||
							data < 0 ||
							data > lobbyData.settings[4] ||
							socket.id !== lobbyData.state.data.id ||
							lobbyData.state.id !== Constants.GameState.USER_PICKING_WORD
						) break;

						startGame(this.options, lobbyData, io, data);
						break;
					}

					case Constants.Packets.DRAW: {
						if(
							socket.id !== lobbyData.state.data.id ||
							!Array.isArray(data) ||
							data.length > 6
						) break;

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
							lobbyData.state.id !== Constants.GameState.IN_GAME_WAITING_ROOM
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

						io.to(lobbyId).emit("data", {
							id: Constants.Packets.UPDATE_GAME_DATA,
							data: {
								id: Constants.GameState.CURRENT_ROUND,
								time: 2,
								data: lobbyData.round
							}
						});

						lobbyData.internal.customWords = data.split(", ");
						lobbyData.state.id = 2;
						lobbyData.state.time = 2;
						break;
					}

					case Constants.Packets.TEXT: {
						if(typeof data !== "string") break;

						const player = lobbyData.users.find(usr => usr.id === userId);

						if(
							lobbyData.internal.currentWord === data &&
							lobbyData.state.id === Constants.GameState.CAN_DRAW &&
							lobbyData.state.data.id !== userId &&
							!player.guessed
						) {
							player.guessed = true;

							socket.to(lobbyId).emit("data", {
								id: Constants.Packets.PLAYER_GUESSED,
								data: {
									id: userId
								}
							});

							socket.emit("data", {
								id: Constants.Packets.PLAYER_GUESSED,
								data: {
									id: userId,
									word: lobbyData.internal.currentWord
								}
							});

							lobbyData.internal.playersGuessed++;

							// +1 to account for the current person drawing
							if(lobbyData.internal.playersGuessed + 1 >= lobbyData.users.length) {
								lobbyData.internal.everyoneGuessed = true;
								lobbyData.state.time = 0;
							}
							break;
						}

						io.to(lobbyId).emit("data", {
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

				const index = lobbyData.users.findIndex(usr => usr.id === userId);
				if(index === -1) return;

				lobbyData.users.splice(index, 1);

				if(lobbyData.users.length === 0) {
					delete lobbies[lobbyData.settings[0]][lobbyData.id];
					return;
				}

				socket.to(lobbyId).emit("data", {
					id: Constants.Packets.PLAYER_LEAVE,
					data: {
						id: userId,
						reason: Constants.LeaveReason.DISCONNECT
					}
				});

				if(lobbyData.owner === socket.id) {
					const newOwner = lobbyData.users[0]?.id;

					lobbyData.owner = newOwner;

					socket.to(lobbyId).emit("data", {
						id: Constants.Packets.SET_OWNER,
						data: newOwner
					});
				}

				if(lobbyData.state.id === 4 && userId === lobbyData.state.data.id) {
					lobbyData.internal.drawerLeft = true;
					lobbyData.state.time = 0;
				}

				if(lobbyData.state.id === 3 && userId === lobbyData.state.data.id) {
					lobbyData.state.id = 2;
					lobbyData.state.time = 0;
				}

				if(lobbyData.users.length === 1) {
					lobbyData.state.id = 2;
					lobbyData.state.time = 0;
				}
			});
		});

		const port = this.options.port ?? 3000;

		server.listen(port, () => {
			console.log(`Started server on http://localhost:${port}`);
		});
	}
}

function startGame(options, lobbyData, io, selectedWord = 0) {
	const drawer = getNextDrawer(lobbyData.users, options.reverseDrawOrder);
	drawer.hasDrawn = true;

	lobbyData.internal.currentWord = lobbyData.internal.possibleWords[selectedWord];
	lobbyData.state.id = 4;
	lobbyData.state.time = lobbyData.settings[2];
	lobbyData.state.data.word = lobbyData.settings[6] === Constants.WordMode.HIDDEN ? [] : [lobbyData.internal.currentWord.length];

	for(const user of lobbyData.users) {
		for(const user of lobbyData.users) {
			user.votekicks = 0;
			user.didVoteKick = false;
			user.didVote = false;
		}

		// Send packet to all players except drawer
		if(user.id === drawer.id) continue;

		io.to(user.id).emit("data", {
			id: Constants.Packets.UPDATE_GAME_DATA,
			data: {
				id: 4,
				time: lobbyData.settings[2],
				data: {
					id: drawer.id,
					word: [lobbyData.internal.currentWord.length],
					hints: [],
					drawCommands: []
				}
			}
		});
	}

	io.to(drawer.id).emit("data", {
		id: Constants.Packets.UPDATE_GAME_DATA,
		data: {
			id: 4,
			time: lobbyData.settings[2],
			data: {
				id: drawer.id,
				word: lobbyData.internal.currentWord
			}
		}
	});
}

function createLobby(options, type = Constants.LobbyType.PUBLIC, lang = 0, io) {
	const lobbyId = crypto.randomBytes(8).toString("base64url");

	const lobbyData = {
		internal: {
			ipMap: {},
			blockedIps: [],
			customWords: [],
			possibleWords: [],
			currentWord: "",
			drawerLeft: false,
			everyoneGuessed: false,
			playersGuessed: 0
		},
		settings: [
			lang,
			options.maxPlayerCount ?? 12,
			options.defaultSettings.maxDrawTime ?? 80,
			options.defaultSettings.totalRounds ?? 3,
			options.defaultSettings.wordCount ?? 3,
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

	lobbies[lang][lobbyId] = lobbyData;

	const interval = setInterval(() => {
		if(!lobbyData) clearInterval(interval);

		if(lobbyData.state.time > 0) return lobbyData.state.time--;

		switch(lobbyData.state.id) {
			case Constants.GameState.CURRENT_ROUND: {
				for(const user of lobbyData.users) {
					// @ts-expect-error
					user.votekicks = 0;
					// @ts-expect-error
					user.didVoteKick = false;
					// @ts-expect-error
					user.didVote = false;
					// @ts-expect-error
					user.hasDrawn = false;
				}

				if(lobbyData.users.length === 1) {
					lobbyData.state.id = lobbyData.type === Constants.LobbyType.PUBLIC ? 0 : 7;
					lobbyData.state.time = 0;

					io.to(lobbyData.id).emit("data", {
						id: Constants.Packets.UPDATE_GAME_DATA,
						data: {
							id: lobbyData.state.id,
							time: 0,
							data: 0
						}
					});
					return;
				}

				const drawerId = getNextDrawer(lobbyData.users, options.reverseDrawOrder)?.id;

				lobbyData.state.id = 3;
				lobbyData.state.time = 15;
				lobbyData.state.data.id = drawerId;

				// Send packet to all players except drawer
				for(const user of lobbyData.users) {
					// @ts-expect-error
					if(user.id === drawerId) continue;

					// @ts-expect-error
					io.to(user.id).emit("data", {
						id: Constants.Packets.UPDATE_GAME_DATA,
						data: {
							id: 3,
							time: lobbyData.state.time,
							data: {
								id: drawerId
							}
						}
					});
				}

				// @ts-expect-error
				lobbyData.internal.possibleWords = getRandomWords(lobbyData.settings[4], lobbyData.settings[7], lobbyData.internal.customWords);

				io.to(drawerId).emit("data", {
					id: Constants.Packets.UPDATE_GAME_DATA,
					data: {
						id: 3,
						time: lobbyData.state.time,
						data: {
							id: drawerId,
							words: lobbyData.internal.possibleWords
						}
					}
				});
				break;
			}

			case Constants.GameState.USER_PICKING_WORD: {
				startGame(options, lobbyData, io);
				break;
			}

			case Constants.GameState.CAN_DRAW: {
				let endReason;
				if(lobbyData.internal.drawerLeft) endReason = Constants.DrawResultsReason.DRAWER_LEFT;
					else if(lobbyData.internal.everyoneGuessed) endReason = Constants.DrawResultsReason.EVERYONE_GUESSED;
					else endReason = Constants.DrawResultsReason.TIME_IS_UP;

				io.to(lobbyId).emit("data", {
					id: Constants.Packets.UPDATE_GAME_DATA,
					data: {
						id: 5,
						time: lobbyData.state.time,
						data: {
							reason: endReason,
							word: lobbyData.internal.currentWord,
							scores: []
						}
					}
				});

				for(const user of lobbyData.users) {
					// @ts-expect-error
					user.guessed = false;
				}

				lobbyData.internal.everyoneGuessed = false;
				lobbyData.internal.drawerLeft = false;
				lobbyData.internal.playersGuessed = 0;

				lobbyData.state.data.drawCommands = [];
				lobbyData.state.data.word = [];
				lobbyData.state.data.hints = [];

				lobbyData.state.time = 3;

				if(!getNextDrawer(lobbyData.users)) {
					if(lobbyData.round + 1 >= lobbyData.settings[3]) {
						lobbyData.state.id = Constants.GameState.GAME_RESULTS;
						lobbyData.state.time = 5;

						io.to(lobbyId).emit("data", {
							id: Constants.Packets.UPDATE_GAME_DATA,
							data: {
								id: Constants.GameState.GAME_RESULTS,
								time: lobbyData.state.time,
								data: []
							}
						});
					} else {
						lobbyData.round++;

						setTimeout(() => {
							io.to(lobbyId).emit("data", {
								id: Constants.Packets.UPDATE_GAME_DATA,
								data: {
									id: Constants.GameState.CURRENT_ROUND,
									time: 2,
									data: lobbyData.round
								}
							});

							lobbyData.state.id = Constants.GameState.CURRENT_ROUND;
							lobbyData.state.time = 2;
						}, 3000);
					}
				} else lobbyData.state.id = Constants.GameState.DRAW_RESULTS;
				break;
			}

			case Constants.GameState.DRAW_RESULTS: {
				lobbyData.state.id = Constants.GameState.CURRENT_ROUND;
				lobbyData.state.time = 0;
				break;
			}

			case Constants.GameState.GAME_RESULTS: {
				lobbyData.round = 0;

				if(lobbyData.type === Constants.LobbyType.PUBLIC) {
					lobbyData.state.id = Constants.GameState.CURRENT_ROUND;
					lobbyData.state.time = 2;

					io.to(lobbyId).emit("data", {
						id: Constants.Packets.UPDATE_GAME_DATA,
						data: {
							id: lobbyData.state.id,
							time: lobbyData.state.time,
							data: 0
						}
					});
				} else {
					lobbyData.state.id = Constants.GameState.IN_GAME_WAITING_ROOM;
					lobbyData.state.time = 0;

					io.to(lobbyId).emit("data", {
						id: Constants.Packets.UPDATE_GAME_DATA,
						data: {
							id: lobbyData.state.id,
							time: lobbyData.state.time,
							data: 0
						}
					});
				}
			}
		}
	}, 1000);

	return lobbyId;
}

function getRandomWords(count = 1, useOnlyAdditionalWords = false, additionalWords = []) {
	const words = [];
	const possibleWords = (useOnlyAdditionalWords && additionalWords.length > 10) ? additionalWords : dictionary.concat(additionalWords);

	for(let i = 0; i < count; i++) {
		words.push(possibleWords[Math.floor(Math.random() * possibleWords.length)]);
	}

	return words;
}

function getNextDrawer(users, reverse = false) {
	let user;

	if(reverse) {
		for(let i = (users.length - 1); i >= 0; i--) {
			if(users[i].hasDrawn) continue;

			user = users[i];
			break;
		}

	} else {
		user = users.find(usr => !usr.hasDrawn);
	}

	return user;
}

module.exports = {
	Server
};