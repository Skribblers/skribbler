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
					typeof data.avatar[0] !== "number" ||
					typeof data.avatar[1] !== "number" ||
					typeof data.avatar[2] !== "number" ||
					typeof data.avatar[3] !== "number"
				) return socket.disconnect();

				if(!data.name) data.name = dictionary[Math.floor(Math.random() * dictionary.length)];
				data.name.substring(0, 16);

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

							if(lobbyData.type === Constants.LobbyType.PRIVATE && lobbyData.players.length >= lobbyData.settings[1]) continue;

							lobbyId = lobby;
							break;
						}
					}

					// If no lobby was found, then create one for the user
					if(!lobbyId) lobbyId = createLobby(Constants.LobbyType.PUBLIC, data.lang);
				}

				lobbyData = lobbies[data.lang][lobbyId];
				socket.join(lobbyId);

				const userData = {
					id: userId,
					name: data.name,
					avatar: data.avatar,
					score: 0,
					guessed: false,
					flags: 0,
					// === Internal Usage ===
					votekicks: 0
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

			socket.on("data", ({id, data}) => {
				if(
					typeof id !== "number"
				) return socket.disconnect();

				switch(id) {
					case Constants.Packets.HOST_KICK: {
						if(
							typeof data !== "string" ||
							socket.id !== lobbyData.owner 
						) break;

						const index = lobbyData.users.find(usr => usr.id === data);
						if(index === -1) break;

						io.in(lobbyId).emit("data", {
							id: Constants.Packets.PLAYER_LEAVE,
							data: {
								id: data,
								reason: Constants.LeaveReason.KICKED
							}
						});

						io.in(data).emit("reason", Constants.LeaveReason.BANNED);
						io.in(data).disconnectSockets(true);

						lobbyData.users.splice(index, 1);
						break;
					}

					case Constants.Packets.HOST_BAN: {
						if(
							typeof data !== "string" ||
							socket.id !== lobbyData.owner 
						) break;

						const index = lobbyData.users.find(usr => usr.id === data);
						if(index === -1) break;

						io.in(lobbyId).emit("data", {
							id: Constants.Packets.PLAYER_LEAVE,
							data: {
								id: data,
								reason: Constants.LeaveReason.KICKED
							}
						});

						io.in(data).emit("reason", Constants.LeaveReason.BANNED);
						io.in(data).disconnectSockets(true);

						lobbyData.users.splice(index, 1);
						break;
					}

					case Constants.Packets.UPDATE_SETTINGS: {
						if(
							typeof data?.id !== "string" ||
							typeof data?.val !== "string" ||
							socket.id !== lobbyData.owner,
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
				if(!userId) return;

				lobbyData.users.splice(userId, 1);

				socket.to(lobbyId).emit("data", {
					id: Constants.Packets.PLAYER_LEAVE,
					data: {
						id: userId,
						reason: Constants.LeaveReason.DISCONNECT
					}
				});
			});
		});

		const port = this.options.port ?? 3000;

		server.listen(port, () => {
			console.log(`Started server on http://localhost:${port}`);
		});
	}
}

function createLobby(type = Constants.LobbyType.PUBLIC, lang = 0) {
	const lobbyId = crypto.randomBytes(8).toString("base64url");

	if(!lobbies[lang]) lobbies[lang] = {};

	lobbies[lang][lobbyId] = {
		internal: {
			blockedIps: []
		},
		settings: [
			lang,
			12,
			80,
			3,
			2,
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
				id: -1,
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