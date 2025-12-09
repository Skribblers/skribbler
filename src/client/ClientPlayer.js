// @ts-check
const { ReportBuilder } = require("../builders/ReportBuilder.js");
const { Packets, UserFlags } = require("../constants.js");

class ClientPlayer {
    client;

    id = 0;
    name = "";
    
    /**
     * @type {Array<Number>}
     */
    avatar = [];
    score = 0;
    guessed = false;
    flags = 0;

    /**
	 * @param {any} player
     * @param {any} client
	 */
    constructor(player, client) {
        this.id = player.id;
        this.name = player.name;
        this.avatar = player.avatar;
        this.score = player.score ?? 0;
        this.guessed = player.guessed ?? false;
        this.flags = player.flags ?? 0;

        this.client = client;
    }

    get isHost() {
        return this.id === this.client.ownerId;
    }

    get isDrawer() {
        return this.id === this.client.drawerId;
    }

    get isAdmin() {
        return (this.flags & UserFlags.ADMIN) === UserFlags.ADMIN;
    }

    /**
	 * @name kick
	 * @description Kick a player from the lobby as the host
	 * @throws
	 */
	kick() {
        if(!this.client.isHost) throw Error("ClientPlayer#kick can only be used if you're the host");

		this.client.sendPacket(Packets.HOST_KICK, this.id);
	}

    /**
	 * @name ban
	 * @description Ban a player from the lobby as the host
	 * @throws
	 */
	ban() {
        if(!this.client.isHost) throw Error("ClientPlayer#ban can only be used if you're the host");

		this.client.sendPacket(Packets.HOST_BAN, this.id);
	}

    /**
	 * @name votekick
	 * @description Vote to kick out a player from the lobby
	 */
	votekick() {
		this.client.sendPacket(Packets.VOTEKICK, this.id);
	}

    /**
	 * @name report
     * @description Report a player
     * @param {Number | ReportBuilder} reason - Reason for the report
     * @throws
	 */
	report(reason) {
        if(!(reason instanceof ReportBuilder) && typeof reason !== "number") throw Error("Report reason must either be a number or an instance of ReportBuilder");

		this.client.sendPacket(Packets.REPORT, {
            id: this.id,
            reason: reason instanceof ReportBuilder ? reason.toValue() : reason
        });
	}
}

module.exports = {
    ClientPlayer
};