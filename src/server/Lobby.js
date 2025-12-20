// @ts-check
const events = require("events");
const crypto = require("crypto");
const { LobbyState } = require("./LobbyState.js");
const { ServerPlayer } = require("./ServerPlayer.js");
const { Language, Packets, LobbyType, GameState, SettingsMinValue, SettingsMaxValue, WordMode, LeaveReason, GameStartError } = require("../constants.js");

// eslint-disable-next-line no-unused-vars
const { Socket } = require("socket.io");

class Lobby extends events {
    ownerId = -1;

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

    /**
     * @description A list of IPs that are blocked from joining this lobby
     * @type {Set<String>}
     */
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

        this.id = options.id ?? crypto.randomBytes(5).toString("base64url");
        this.lobbyType = options.type ?? LobbyType.PUBLIC;

        this.settings = {
            0: options.language ?? Language.ENGLISH,
            1: 12,
            2: 80,
            3: 3,
            4: 3,
            5: 2,
            6: WordMode.NORMAL,
            7: 0
        }

        this.state = new LobbyState(this, this.lobbyType);
    }

    /**
     * @param {Socket} socket
     * @param {Object} login
     * @param {String | Number} login.join
     * @param {Number} login.create
     * @param {String} login.name
     * @param {String} login.lang
     * @param {Array<Number>} login.avatar
     */
    _playerJoin(socket, login) {
        socket.join(this.id);

        const player = new ServerPlayer({
            socket,
            lobby: this,
            player: {
                id: this._playerCounter++,
                name: login.name,
                avatar: login.avatar
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
            // Rounds are zero-indexed, if round 0 was sent to the client then the client percieves it as round 1.
            round: this.state.round - 1,
            state: this.state._currentStateData()
        });

        // Announce to all online players that a new player has joined
        this.broadcast(socket, Packets.PLAYER_JOIN, player.publicInfo);

        socket.on("data", (/** @type {any} */ data) => this._handlePacket(socket, data));
        socket.on("disconnect", () => this._handleDisconnect(socket));

        // If the public lobby is currently waiting for players, and we now have enough players, then start the game
        if(
            this.state.id === GameState.WAITING_FOR_PLAYERS &&
            this.players.size >= 2
        ) {
            this.state._gameStartingSoon();
        }
    }

    /**
     * @param {Socket} socket
     * @param {Object} packet
     * @param {Number} packet.id
     * @param {any} [packet.data]
     */
    _handlePacket(socket, packet) {
        if(typeof packet.id !== "number") return;

        if(this.server.ignorePackets.includes(packet.id)) return;

        const sender = this.sidMap.get(socket.id);
        if(typeof sender === "undefined") return;

        switch(packet.id) {
            case Packets.HOST_KICK: {
                if(!sender.isHost) break;

                const player = this.players.get(packet.data);
                if(!player) return;

                player.remove(LeaveReason.KICKED);
                break;
            }

            case Packets.HOST_BAN: {
                if(!sender.isHost) break;

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
                    sender.isDrawer ||
                    // Make sure the player cant vote multiple times
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
                const { id: settingId, val: settingVal } = packet.data;

                // If the packet fails verification, then we resend the proper setting back to the client to avoid the client from having desynced settings
                if(
                    // Lobby settings can only be updated in the waiting room
                    this.state.id !== GameState.PRIVATE_LOBBY_SETUP ||
                    // Make sure the person who sent the packet is the host
                    !sender.isHost ||
                    // Make sure the setting ID that was sent is valid
                    Object.hasOwn(this.settings, settingId) ||
                    // Make sure the setting value is within bounds
                    // @ts-expect-error
                    SettingsMinValue[settingId] > settingVal ||
                    // @ts-expect-error
                    SettingsMaxValue[settingId] < settingVal
                    // @ts-expect-error
                ) return sender.send(Packets.UPDATE_SETTINGS, { id: settingId, val: this.settings[settingId] });

                this.updateSetting(settingId, settingVal);
                break;
            }

            case Packets.SELECT_WORD: {
                if(
                    this.state.id !== GameState.USER_PICKING_WORD ||
                    !sender.isDrawer
                ) break;

                this.state.chooseWord(packet.data);
                break;
            }

            case Packets.DRAW: {
                if(
                    this.state.id !== GameState.START_DRAW ||
                    !sender.isDrawer
                ) break;

                this.state.drawCommands.push(...packet.data);

                this.broadcast(socket, Packets.DRAW, packet.data);
                break;
            }

            case Packets.CLEAR_CANVAS: {
                if(
                    this.state.id !== GameState.START_DRAW || 
                    !sender.isDrawer
                ) break;

                this.state.drawCommands = [];

                this.broadcast(socket, Packets.CLEAR_CANVAS);
                break;
            }

            case Packets.UNDO: {
                if(
                    typeof packet.data !== "number" ||
                    this.state.id !== GameState.START_DRAW ||
                    !sender.isDrawer
                ) break;

                this.state.drawCommands.splice(packet.data);

                this.broadcast(socket, Packets.UNDO, packet.data);
                break;
            }

            case Packets.START_GAME: {
                if(
                    this.state.id !== GameState.PRIVATE_LOBBY_SETUP ||
                    !sender.isHost
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

                this.state._newRound();
                break;
            }

            case Packets.TEXT: {
                if(typeof packet.data !== "string") return;

                const msg = packet.data.substring(0, 100);

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