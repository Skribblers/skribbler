const events = require("events");
const crypto = require("crypto");
const { ServerPlayer } = require("./ServerPlayer.js");
const { Language, Packets, LobbyType, WordMode } = require("../constants.js");

class Lobby extends events {
    id = crypto.randomBytes(8).toString("base64url");

    lobbyType = null;
    ownerId = -1;

    settings = {
        language: Language.ENGLISH,
        maxPlayers: 12,
        maxDrawTime: 90,
        maxRounds: 3,
        wordCount: 3,
        maxHints: 3,
        wordMode: WordMode.NORMAL,
        useCustomWords: 0
    }

    players = new Map();

    /**
     * @param {any} options
     */
    constructor(options) {
        super();

        this.lobbyType = options.type ?? LobbyType.PUBLIC;
        this.settings.language = options.language;
    }

    /**
     * @param {any} socket
     * @param {any} loginData
     */
    _playerJoin(socket, loginData) {
        const player = new ServerPlayer({
            socket,
            server: this,
            player: {
                id: this.players.size + 1,
                name: loginData.name,
                avatar: loginData.avatar
            }
        });

        if(this.players.size === 0) this.ownerId = player.id;

        this.players.set(player.id, player);

        player.sendPacket(Packets.LOBBY_DATA, {
            settings: Object.values(this.settings),
            id: this.id,
            type: this.lobbyType,
            me: player.id,
            owner: this.ownerId,
            users: player.publicInfo,
            round: 0,
            state: {
                state: 0,
                time: 0,
                data: 0
            }
        });

        socket.on("data", (data) => this._handlePacket(socket, data));
    }

    _handlePacket(socket, data) {
        console.log(data);
    }
}

module.exports = { Lobby };