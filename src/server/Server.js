// @ts-check
const events = require("events");
const { Lobby } = require("./Lobby.js");
const { LobbyType } = require("../constants.js");

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

        io.on("connection", (socket) => this._handleConnection(socket, this));

        console.log(1);
        server.listen(3000, () => {
            console.log(`Started server on http://localhost:3000`);
        });
    }

    /**
     * @param {Socket} socket
     * @param {any} server
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

            // Look for a lobby for the player
            if(data.create === LobbyType.PRIVATE) {
                const lobby = server.createLobby({ type: LobbyType.PRIVATE });

                lobby._playerJoin(socket, data);
                return;
            }

            return socket.disconnect();
        });
    }

    /**
     * @param {Object} [options]
     */
    createLobby(options) {
        const lobby = new Lobby(options);

        this.lobbies.set(lobby.id, lobby);

        return lobby;
    }
}

module.exports = { Server };