// @ts-check
const events = require("events");
const { Packets, LeaveReason } = require("../constants.js");

// eslint-disable-next-line no-unused-vars
const { Socket } = require("socket.io");

class ServerPlayer extends events {
    /**
     * @class
     * @param {Object} options
     * @param {Socket} options.socket
     * @param {any} options.lobby
     * @param {any} options.player
     */
    constructor({ socket, lobby, player }) {
        super();

        this.socket = socket;
        this.lobby = lobby;

        this.sid = socket.id;
        this.id = player.id;
        this.name = player.name;
        this.avatar = player.avatar;
        this.score = 0;
        this.guessed = false;
    }

    /**
     * @name publicInfo
     * @description Get information about the player that should be relayed to other online players
     * @readonly
     */
    get publicInfo() {
        return {
            id: this.id,
            name: this.name,
            avatar: this.avatar,
            score: this.score,
            guessed: this.guessed,
            flags: 0
        }
    }

    /**
     * @name send
     * @description Send a data packet to the player
     * @param {Number} id
     * @param {any} [data]
     */
    send(id, data) {
        this.socket.emit("data", { id, data });
    }

    /**
     * @name remove
     * @description Kick or ban a player from the lobby
     * @param {Number} reason - Reason for the player's removal
     */
    remove(reason) {
        // Announce to all online players about the kick/ban
        this.lobby.broadcast(this.socket, Packets.PLAYER_LEAVE, {
            id: this.id,
            reason: reason
        });

        // Remove the player from the lobby's player list
        this.lobby.players.delete(this.id);
        this.lobby.sidMap.delete(this.sid);

        // Inform the player why they were disconnected
        this.socket.emit("reason", reason);
        this.socket.disconnect();

        // Block the player's IP from rejoining if they should be banned
        if(reason === LeaveReason.BANNED) {
            this.lobby.blockedIps.add(this.socket.handshake.address);
        }
    }

    /**
     * @name setAvatar
     * @description Change the player's avatar
     * @param {Array<Number>} avatar - The new avatar
     */
    setAvatar(avatar) {
        this.avatar = avatar;

        this.lobby.send(Packets.UPDATE_AVATAR, { id: this.id, avatar })
    }

    /**
     * @name setName
     * @description Change the player's name
     * @param {String} name - The new name
     */
    setName(name) {
        this.name = name;

        this.lobby.send(Packets.UPDATE_NAME, { id: this.id, name })
    }
}

module.exports = { ServerPlayer };