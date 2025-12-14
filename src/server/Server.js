// @ts-check
const events = require("events");
const { Lobby } = require("./Lobby.js");
const { LobbyType, Settings, SettingsMinValue, SettingsMaxValue, Language } = require("../constants.js");

// Web server
const http = require("http");
// eslint-disable-next-line no-unused-vars
const { Server: serverIo, Socket } = require("socket.io");

class Server extends events {
    constructor(options = {}) {
        super();

        this.options = options

        this.init()
    }

    options = {};
    /**
	 * @type {serverIo | null}
	 */
    serverIo = null;

    // List of all lobbies that exist for the server
    lobbies = new Map();

    async init() {
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

        server.listen(3000, () => {
            console.log(`Started server on http://localhost:3000`);
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
                const lobby = server.createLobby({ type: LobbyType.PRIVATE, language });

                lobby._playerJoin(socket, data);
                return;
            }

            // Try to find a public lobby for the user
            let foundLobby;
            for(const obj of this.lobbies) {
                const lobby = obj[1];

                if(
                    lobby.lobbyType !== LobbyType.PUBLIC ||
                    lobby.players.size >= lobby.settings[Settings.MAX_PLAYER_COUNT] ||
                    lobby.blockedIps.has(socket.handshake.address)
                ) continue;

                foundLobby = lobby;
                break;
            }

            // If we were not able to find a lobby then create one
            if(!foundLobby) foundLobby = server.createLobby({ language });

            foundLobby._playerJoin(socket, data);
        });
    }

    /**
     * @name createLobby
     * @description Create a lobby on the server
     * @param {Object} [options] - Lobby options
     * @param {Number} [options.type] - Whether the lobby should be public or private
     * @param {Number} [options.language] - The language the lobby should use
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