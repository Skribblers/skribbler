const events = require("events");
const crypto = require("crypto");
const { ServerPlayer } = require("./ServerPlayer.js");
const { Language, Packets, LobbyType, GameState, Settings, SettingsMinValue, SettingsMaxValue, WordMode, LeaveReason } = require("../constants.js");

class Lobby extends events {
    id = crypto.randomBytes(8).toString("base64url");

    lobbyType = null;
    ownerId = -1;

    settings = {
        0: null,
        1: 12,
        2: 90,
        3: 3,
        4: 3,
        5: 3,
        6: WordMode.NORMAL,
        7: 0
    }

    players = new Map();
    // Mappings between a player's session ID to their player ID
    sidMap = new Map();

    blockedIps = new Set();

    /**
     * @param {any} options
     */
    constructor(options, server) {
        super();

        this.server = server;
        this.lobbyType = options.type ?? LobbyType.PUBLIC;
        this.settings[Settings.LANGUAGE] = Number(options.lang ?? Language.ENGLISH);
    }

    /**
     * @param {any} socket
     * @param {any} loginData
     */
    _playerJoin(socket, loginData) {
        socket.join(this.id);

        const player = new ServerPlayer({
            socket,
            lobby: this,
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

        player.emit(Packets.LOBBY_DATA, {
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
        this.broadcast(socket, Packets.PLAYER_JOIN, player.publicInfo);

        socket.on("data", (data) => this._handlePacket(socket, data));
        socket.on("disconnect", () => this._handleDisconnect(socket));
    }

    _handlePacket(socket, packet) {
        if(typeof packet.id !== "number") return;

        const playerId = this.sidMap.get(socket.id);

        switch(packet.id) {
            case Packets.HOST_KICK: {
                if(this.ownerId !== playerId) return;

                const player = this.players.get(packet.data);
                if(!player) return;

                player.remove(LeaveReason.KICKED);
                break;
            }

            case Packets.HOST_BAN: {
                if(this.ownerId !== playerId) return;

                const player = this.players.get(packet.data);
                if(!player) return;

                player.remove(LeaveReason.BANNED);
                break;
            }

            case Packets.UPDATE_SETTINGS: {
                const settingId = packet.data.id;
                const settingVal = packet.data.val;

                // If the packet fails verification, then we resend the proper setting back to the client to avoid the client from having desynced settings
                const player = this.players.get(playerId);
                const oldData = { id: settingId, val: this.settings[settingId] };

                if(this.ownerId !== playerId) return player.emit(Packets.UPDATE_SETTINGS, oldData);

                // Make sure the setting is valid
                if(!Object.hasOwn(this.settings, settingId)) return player.emit(Packets.UPDATE_SETTINGS, oldData);

                // Make sure setting is inside bounds
                if(
                    SettingsMinValue[settingId] > settingVal ||
                    SettingsMaxValue[settingId] < settingVal
                ) return player.emit(Packets.UPDATE_SETTINGS, oldData);

                this.updateSetting(settingId, settingVal);
                break;
            }

            case Packets.TEXT: {
                if(typeof packet.data !== "string") return;

                const msg = packet.data.substring(0, 100);

                // DEBUGGING FEATURE - REMOVE ON RELEASE
                if(msg === "sethost") this.setHost(playerId);

                this.emit(Packets.TEXT, { id: playerId, msg });
                break;
            }
        }
    }

    _handleDisconnect(socket) {
        const playerId = this.sidMap.get(socket.id);
        if(!playerId) return;

        // Announce to all online players that a player has left
        this.broadcast(socket, Packets.PLAYER_LEAVE, {
            id: playerId,
            reason: LeaveReason.DISCONNECT
        });

        // Delete the player from the lobby's player list
        this.players.delete(playerId);
        this.sidMap.delete(playerId);

        // If there are no more players left in the lobby, then delete the lobby
        if(this.players.size === 0) {
            this.server.deleteLobby(this);
            return;
        }

        // Set a new host if the player who left was the host
        if(this.ownerId === playerId) {
            const [ id ] = this.players.entries().next().value;

            this.setHost(id);
        }
    }

    // Emit a packet to all online players in the lobby
    emit(id, data) {
        this.server.serverIo.to(this.id).emit("data", { id, data });
    }

    // Emit a packet to all online players in the lobby except for the socket
    broadcast(socket, id, data) {
        socket.broadcast.to(this.id).emit("data", {id, data});
    }

    updateSetting(setting, value) {
        this.settings[setting] = value;

        this.emit(Packets.UPDATE_SETTINGS, {
            id: setting,
            val: value
        });
    }

    setHost(newHostId) {
        this.ownerId = newHostId;
        this.emit(Packets.SET_OWNER, newHostId);
    }
}

module.exports = { Lobby };