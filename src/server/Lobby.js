// @ts-check
const events = require("events");
const crypto = require("crypto");
const { LobbyState } = require("./LobbyState.js");
const { ServerPlayer } = require("./ServerPlayer.js");
const { Language, Packets, LobbyType, GameState, Settings, SettingsMinValue, SettingsMaxValue, WordMode, LeaveReason, GameStartError } = require("../constants.js");

// eslint-disable-next-line no-unused-vars
const { Socket } = require("socket.io");

class Lobby extends events {
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

    /**
     * @type {Map<Number, ServerPlayer>}
     */
    players = new Map();
    /**
     * @description Mappings between a player's session ID to their player ID
     * @type {Map<String, ServerPlayer>}
     */
    sidMap = new Map();
    _playerCounter = 0;

    blockedIps = new Set();

    state = new LobbyState(this);

    /**
     * @class
     * @param {Object} [options] - Lobby options
     * @param {String} [options.id] - The lobby ID to give the lobby
     * @param {Number} [options.type] - Whether the lobby should be public or private
     * @param {Number} [options.language] - The language the lobby should use
     * @param {any} server
     */
    constructor(server, options = {}) {
        super();
        this.server = server;

        this.id = options.id ?? crypto.randomBytes(8).toString("base64url");
        this.lobbyType = options.type ?? LobbyType.PUBLIC;
        // @ts-expect-error
        this.settings[Settings.LANGUAGE] = options.language ?? Language.ENGLISH;

        // if(this.lobbyType === LobbyType.PRIVATE) this.state._inGameWaitingRoom();

        this.state._inGameWaitingRoom();
    }

    /**
     * @param {Socket} socket
     * @param {any} loginData
     */
    _playerJoin(socket, loginData) {
        socket.join(this.id);

        const player = new ServerPlayer({
            socket,
            lobby: this,
            player: {
                id: this._playerCounter++,
                name: loginData.name,
                avatar: loginData.avatar
            }
        });

        if(this.lobbyType === LobbyType.PRIVATE && this.players.size === 0) this.ownerId = player.id;

        this.players.set(player.id, player);
        this.sidMap.set(socket.id, player);

        // Get a list of players to send
        const players = [];
        for(const obj of this.players) {
            players.push(obj[1].publicInfo);
        }

        player.send(Packets.LOBBY_DATA, {
            settings: Object.values(this.settings),
            id: this.id,
            type: this.lobbyType,
            me: player.id,
            owner: this.ownerId,
            users: players,
            round: 0,
            state: this.state._currentStateData()
        });

        // Announce to all online players that a new player has joined
        this.broadcast(socket, Packets.PLAYER_JOIN, player.publicInfo);

        socket.on("data", (/** @type {any} */ data) => this._handlePacket(socket, data));
        socket.on("disconnect", () => this._handleDisconnect(socket));
    }

    /**
     * @param {Socket} socket
     * @param {any} packet
     */
    _handlePacket(socket, packet) {
        if(typeof packet.id !== "number") return;

        const sender = this.sidMap.get(socket.id);
        if(typeof sender === "undefined") return;

        switch(packet.id) {
            case Packets.HOST_KICK: {
                if(this.ownerId !== sender.id) return;

                const player = this.players.get(packet.data);
                if(!player) return;

                player.remove(LeaveReason.KICKED);
                break;
            }

            case Packets.HOST_BAN: {
                if(this.ownerId !== sender.id) return;

                const player = this.players.get(packet.data);
                if(!player) return;

                player.remove(LeaveReason.BANNED);
                break;
            }

            case Packets.VOTEKICK: {
                // Prevent the player from voting multiple times
                if(this.state.votekicks.has(sender.id)) return;

                const votee = this.players.get(packet.data);
                if(!votee) return;

                const votesRequired = Math.floor(this.players.size / 2) + 1;

                this.state.votekicks.add(sender.id);
                votee.votekicks++;

                this.broadcast(votee.socket, Packets.VOTEKICK, [
                    sender.id,
                    votee.id,
                    votee.votekicks,
                    votesRequired
                ]);

                if(votee.votekicks >= votesRequired) {
                    votee.remove(LeaveReason.KICKED);
                }
                break;
            }

            case Packets.VOTE: {
                if(
                    typeof packet.data !== "number" ||
                    this.state.id !== GameState.START_DRAW ||
                    // Don't let the drawer vote for their own drawing
                    this.state.drawer?.id === sender.id ||
                    this.state.voters.has(sender.id)
                ) break;

                this.state.voters.add(sender.id);

                this.send(Packets.VOTE, {
                    id: sender.id,
                    vote: packet.data
                });
                break;
            }

            case Packets.UPDATE_SETTINGS: {
                const settingId = packet.data.id;
                const settingVal = packet.data.val;

                // If the packet fails verification, then we resend the proper setting back to the client to avoid the client from having desynced settings
                // @ts-expect-error
                const oldData = { id: settingId, val: this.settings[settingId] };

                if(this.ownerId !== sender.id) return sender.send(Packets.UPDATE_SETTINGS, oldData);

                // Make sure the setting is valid
                if(!Object.hasOwn(this.settings, settingId)) return sender.send(Packets.UPDATE_SETTINGS, oldData);

                // Make sure setting is inside bounds
                if(
                    // @ts-expect-error
                    SettingsMinValue[settingId] > settingVal || SettingsMaxValue[settingId] < settingVal
                ) return sender.send(Packets.UPDATE_SETTINGS, oldData);

                this.updateSetting(settingId, settingVal);
                break;
            }

            case Packets.SELECT_WORD: {
                if(
                    this.state.id !== GameState.USER_PICKING_WORD ||
                    this.state.drawer?.id !== sender.id
                ) break;

                this.state.chooseWord(packet.data);
                break;
            }

            case Packets.DRAW: {
                if(
                    this.state.drawer?.id !== sender.id ||
                    this.state.id !== GameState.START_DRAW
                ) break;

                this.state.drawCommands.push(...packet.data);

                this.broadcast(socket, Packets.DRAW, packet.data);
                break;
            }

            case Packets.CLEAR_CANVAS: {
                if(
                    this.state.drawer?.id !== sender.id ||
                    this.state.id !== GameState.START_DRAW
                ) break;

                this.state.drawCommands = [];

                this.broadcast(socket, Packets.CLEAR_CANVAS);
                break;
            }

            case Packets.START_GAME: {
                if(
                    this.ownerId !== sender.id ||
                    this.state.id !== GameState.IN_GAME_WAITING_ROOM
                ) break;

                if(this.players.size < 2) {
                    socket.emit("data", { 
                        id: Packets.GAME_START_ERROR,
                        data: {
                            id: GameStartError.NOT_ENOUGH_PLAYERS
                        }
                    });
                    return;
                }

                this.state.startGame();
                break;
            }

            case Packets.TEXT: {
                if(typeof packet.data !== "string") return;

                const msg = packet.data.substring(0, 100);

                // DEBUGGING FEATURE - REMOVE ON RELEASE
                if(msg === "sethost") sender.setHost();

                this.send(Packets.TEXT, { id: sender.id, msg });
                break;
            }
        }
    }

    /**
     * @param {Socket} socket
     */
    _handleDisconnect(socket) {
        const player = this.sidMap.get(socket.id);
        if(typeof player === "undefined") return;

        player.remove(LeaveReason.DISCONNECT);

        // If there are no more players left in the lobby, then delete the lobby
        if(this.players.size === 0) {
            this.server.deleteLobby(this);
            return;
        }

        // Set a new host if the player who left was the host
        if(this.ownerId === player.id) {
            const obj = this.players.entries().next().value;
            if(!obj) return;

            obj[1].setHost();
        }
    }

    /**
     * @name send
     * @description Send a data packet to all online players in the lobby
     * @param {Number} id - Packet ID
     * @param {any} [data] - Packet data
     */
    send(id, data) {
        this.server.serverIo.to(this.id).emit("data", { id, data });
    }

    /**
     * @name broadcast
     * @description Send a data packet to all online players in the lobby except for the socket
     * @param {Socket} socket - Socket
     * @param {Number} id - Packet ID
     * @param {any} [data] - Packet data
     */
    broadcast(socket, id, data) {
        socket.broadcast.to(this.id).emit("data", { id, data });
    }

    /**
     * @name updateSetting
     * @description Update a setting for the lobby and relay it to all online players
     * @param {string | number} setting
     * @param {string | number} value
     */
    updateSetting(setting, value) {
        // @ts-expect-error
        this.settings[setting] = value;

        this.send(Packets.UPDATE_SETTINGS, {
            id: setting,
            val: value
        });
    }
}

module.exports = { Lobby };