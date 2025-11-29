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
        this.score = player.score;
        this.guessed = player.guessed;
        this.flags = player.flags;

        this.client = client;
    }

    get isHost() {
        return this.id === this.client.ownerId;
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
        if(this.client.userId !== this.client.ownerId) throw Error("ClientPlayer#kick can only be used if you're the host");

		this.client.sendPacket(Packets.HOST_KICK, this.id);
	}

    /**
	 * @name ban
	 * @description Ban a player from the lobby as the host
	 * @throws
	 */
	ban() {
        if(this.client.userId !== this.client.ownerId) throw Error("ClientPlayer#ban can only be used if you're the host");

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
     * @param {ReportBuilder} reason - Reason for the report
     * @throws
	 */
	report(reason) {
        if(!(reason instanceof ReportBuilder)) throw Error("Report reason must be made through the ReportBuilder class");

		this.client.sendPacket(Packets.REPORT, {
            id: this.id,
            reason: reason.toValue()
        });
	}
}

module.exports = {
    ClientPlayer
};