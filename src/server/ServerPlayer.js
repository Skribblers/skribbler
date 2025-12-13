const events = require("events");

class ServerPlayer extends events {
    constructor({ socket, server, player }) {
        super();

        this.socket = socket;
        this.server = server;

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

    sendPacket(id, data) {
        this.socket.emit("data", { id, data });
    }
}

module.exports = { ServerPlayer };