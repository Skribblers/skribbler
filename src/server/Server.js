// @ts-check
const events = require("events");
const { Lobby } = require("./Lobby.js");
const { LobbyType, Settings, SettingsMinValue, SettingsMaxValue, Language, JoinError } = require("../constants.js");

// Web server
const http = require("http");
// eslint-disable-next-line no-unused-vars
const { Server: serverIo, Socket } = require("socket.io");

class Server extends events {
    /**
     * @class
     * @param {Object} [options] - Server options
     * @param {Number} [options.port] - Port to host the server on
     * @param {Number} [options.maxLobbies] - Maximum amount of lobbies that the server can hold
     */
    constructor(options = {}) {
        super();

        this.port = options.port ?? 3000;
        this.maxLobbies = options.maxLobbies ?? 512;

        this.init()
    }

    options = {};
    /**
	 * @type {serverIo | null}
	 */
    serverIo = null;

    /**
     * @description List of all lobbies that exist for the server
     * @type {Map<String, Lobby>}
     */
    lobbies = new Map();

    init() {
        if(this.serverIo !== null) throw Error("Server has already started");

        const server = http.createServer();

        const io = new serverIo(server, {
            cors: {
                origin: "",
                methods: ["GET", "POST"]
            }
        });

        this.serverIo = io;

        io.on("connection", (socket) => this._handleConnection(socket, this));

        server.listen(this.port, () => {
            console.log(`Started server on http://localhost:${this.port}`);
        });
    }

    /**
     * @param {Socket} socket
     * @param {Server} server
     */
    async _handleConnection(socket, server) {
        socket.on("login", (data) => {
            // Make sure the login data is valid before we begin
            if(
                typeof data?.name !== "string" ||
                data.name.length > 16 ||
                typeof data.create !== "number" ||
                !Array.isArray(data.avatar)
            ) return socket.disconnect();

            // If the login packet has an invalid language then force the language to English
            const language = Number(data.lang);
            if(
                isNaN(language) ||
                // @ts-expect-error
                data.lang < SettingsMinValue[Settings.LANGUAGE] ||
                // @ts-expect-error
                data.lang > SettingsMaxValue[Settings.LANGUAGE]
            ) {
                data.lang = Language.ENGLISH
            }

            // Create a private lobby for the user if requested
            if(data.create === LobbyType.PRIVATE) {
                // Check if this server has hit the maximum amount of lobbies
                // While the ROOM_FULL join error code isn't exactly accurate, it's the closest to one referencing the server being full
                if(this.lobbies.size >= this.maxLobbies) return this._disconnectWithError(socket, JoinError.ROOM_FULL);

                const lobby = server.createLobby({ type: LobbyType.PRIVATE, language });

                lobby._playerJoin(socket, data);
                return;
            }

            // Check if the lobby that a player is trying to join with exists
            let foundLobby = this.lobbies.get(data.join);
            if(foundLobby) {
                // @ts-expect-error
                if(foundLobby.players.size >= foundLobby.settings[Settings.MAX_PLAYER_COUNT]) {
                    return this._disconnectWithError(socket, JoinError.ROOM_FULL);
                }

                if(foundLobby.blockedIps.has(socket.handshake.address)) {
                    return this._disconnectWithError(socket, JoinError.BANNED_FROM_ROOM);
                }

                foundLobby._playerJoin(socket, data);
                return;
            }

            // If lobby code isn't specified, or a lobby was not found, find a random public lobby
            for(const obj of this.lobbies) {
                const lobby = obj[1];

                if(
                    lobby.lobbyType !== LobbyType.PUBLIC ||
                    // @ts-expect-error
                    lobby.players.size >= lobby.settings[Settings.MAX_PLAYER_COUNT] ||
                    lobby.blockedIps.has(socket.handshake.address)
                ) continue;

                foundLobby = lobby;
                break;
            }

            // If we were not able to find a lobby then create one
            if(!foundLobby) {
                // Check if this server has hit the maximum amount of lobbies
                if(this.lobbies.size >= this.maxLobbies) return this._disconnectWithError(socket, JoinError.ROOM_NOT_FOUND);

                foundLobby = server.createLobby({ language });
            }

            foundLobby._playerJoin(socket, data);
        });
    }

    /**
     * @param {Socket} socket
     * @param {Number} joinError
     */
    _disconnectWithError(socket, joinError = 0) {
        socket.emit("joinerr", joinError);
        socket.disconnect();
    }

    /**
     * @name createLobby
     * @description Create a lobby on the server
     * @param {Object} [options] - Lobby options
     * @param {String} [options.id] - The lobby ID to give the lobby
     * @param {Number} [options.type] - Whether the lobby should be public or private
     * @param {Number} [options.language] - The language the lobby should use
     * @returns {Lobby} lobby - The created lobby
     */
    createLobby(options) {
        const lobby = new Lobby(this, options);

        this.lobbies.set(lobby.id, lobby);
        console.log(`Created lobby ID: ${lobby.id}`);

        return lobby;
    }

    /**
     * @name deleteLobby
     * @description Delte a lobby from the server
     * @param {Lobby} lobby
     */
    deleteLobby(lobby) {
        this.lobbies.delete(lobby.id);

        console.log(`${lobby.id} has been deleted`);
    }
}

module.exports = { Server };