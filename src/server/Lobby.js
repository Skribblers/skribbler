const events = require("events");
const crypto = require("crypto");
const { ServerPlayer } = require("./ServerPlayer.js");
const { Language, Packets, LobbyType, GameState, WordMode } = require("../constants.js");

class Lobby extends events {
    id = crypto.randomBytes(8).toString("base64url");

    lobbyType = null;
    ownerId = -1;

    settings = {
        language: Number(Language.ENGLISH),
        maxPlayers: 12,
        maxDrawTime: 90,
        maxRounds: 3,
        wordCount: 3,
        maxHints: 3,
        wordMode: WordMode.NORMAL,
        useCustomWords: 0
    }

    players = new Map();
    // Mappings between a player's session ID to their player ID
    sidMap = new Map();

    /**
     * @param {any} options
     */
    constructor(options, io) {
        super();

        this.io = io;
        this.lobbyType = options.type ?? LobbyType.PUBLIC;
        this.settings.language = Number(options.lang ?? Language.ENGLISH);
    }

    /**
     * @param {any} socket
     * @param {any} loginData
     */
    _playerJoin(socket, loginData) {
        socket.join(this.id);

        const player = new ServerPlayer({
            socket,
            server: this,
            player: {
                id: this.players.size + 1,
                name: loginData.name,
                avatar: loginData.avatar
            }
        });

        if(this.lobbyType === LobbyType.PRIVATE && this.players.size === 0) this.ownerId = player.id;

        this.players.set(player.id, player);
        this.sidMap.set(socket.id, player.id);

        // Get a list of players to send
        const players = [];
        for(const obj of this.players) {
            players.push(obj[1].publicInfo);
        }

        player.sendPacket(Packets.LOBBY_DATA, {
            settings: Object.values(this.settings),
            id: this.id,
            type: this.lobbyType,
            me: player.id,
            owner: this.ownerId,
            users: players,
            round: 0,
            state: {
                id: GameState.IN_GAME_WAITING_ROOM,
                time: 0,
                data: 0
            }
        });

        // Announce to all online players that a new player has joined
        socket.broadcast.to(this.id).emit("data", {
            id: Packets.PLAYER_JOIN,
            data: player.publicInfo
        });

        socket.on("data", (data) => this._handlePacket(socket, data));
    }

    _handlePacket(socket, data) {
        if(typeof data.id !== "number") return;

        const playerId = this.sidMap.get(socket.id);

        switch(data.id) {
            case Packets.TEXT: {
                const msg = data.data.substring(0, 100);

                this.emit(Packets.TEXT, { id: playerId, msg });
                break;
            }
        }
    }

    // Emit a packet to all online players in the lobby
    emit(id, data) {
        this.io.to(this.id).emit("data", { id, data });
    }
}

module.exports = { Lobby };