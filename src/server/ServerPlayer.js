const events = require("events");
const { Packets, LeaveReason } = require("../constants.js");

class ServerPlayer extends events {
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

    emit(id, data) {
        this.socket.emit("data", { id, data });
    }

    remove(reason) {
        // Announce to all online players about the kick/ban
        this.lobby.broadcast(this.socket, Packets.PLAYER_LEAVE, {
            id: this.id,
            reason: reason
        });

        // Remove the player from the lobby's player list
        this.lobby.players.delete(this.id);
        this.lobby.sidMap.delete(this.id);

        // Inform the player why they were disconnected
        this.socket.emit("reason", reason);
        this.socket.disconnect();

        // Block the player's IP from rejoining if they should be banned
        if(reason === LeaveReason.BANNED) {
            this.lobby.blockedIps.add(this.socket.handshake.address);
        }
    }

    setAvatar(avatar) {
        this.lobby.emit(Packets.UPDATE_AVATAR, { id: this.id, avatar })
    }

    setName(name) {
        this.lobby.emit(Packets.UPDATE_NAME, { id: this.id, name })
    }
}

module.exports = { ServerPlayer };