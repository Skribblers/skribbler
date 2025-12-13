const events = require("events");

class ServerPlayer extends events {
    constructor({ socket, server, player }) {
        super();

        this.socket = socket;
        this.server = server;

        this.id = player.id;
        this.name = player.name;
        this.avatar = player.avatar;
        this.score = 0;
        this.guessed = false;
    }

    sendPacket(id, data) {
        this.socket.emit("data", { id, data });
    }
}

module.exports = { ServerPlayer };