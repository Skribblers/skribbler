// @ts-check
const { Packets } = require("../constants.js");
const { DrawBuilder } = require("../builders/DrawBuilder.js");

class Canvas {
    client;

    /**
     * @type {Array<Array<Number>>}
     */
    drawCommands = [];

    /**
     * @param {any} client
     */
    constructor(client) {
        this.client = client;
    }

    get canDraw() {
        return this.client.userId === this.client.currentDrawer?.id;
    }

	/**
	 * @name draw
	 * @description Draw on the canvas
	 * @param {DrawBuilder | Array<Array<Number>>} data - Draw commands to send. If the array has more then 8 items, the server simply ignores the packet
	 * @throws
	 */
	draw(data) {
		if(!(data instanceof DrawBuilder) && !Array.isArray(data)) throw TypeError("Expected data to either be an array or an instance of DrawBuilder");
        if(!this.canDraw) throw Error("Canvas#draw can only be called by the player who's drawing");

		const drawCmds = data instanceof DrawBuilder ? data.toValue() : data;

		this.drawCommands.push(...drawCmds);

		this.client.sendPacket(Packets.DRAW, drawCmds);
	}

	/**
	 * @name clear
	 * @description Clear the canvas if you are the current drawer
	 * @throws
	 */
	clear() {
        if(!this.canDraw) throw Error("Canvas#clear can only be called by the player who's drawing");

		this.drawCommands = [];

		this.client.sendPacket(Packets.CLEAR_CANVAS);
	}

	/**
	 * @name undo
	 * @description Undo a draw event
	 * @param {Number} [id]
	 * @throws
	 */
	undo(id) {
        if(!this.canDraw) throw Error("Canvas#undo can only be called by the player who's drawing");

		if(this.drawCommands.length === 1) return this.clear();

		id ??= this.drawCommands.length - 1;

		this.drawCommands.splice(id, 1);

		this.client.sendPacket(Packets.UNDO, id);
	}
}

module.exports = {
    Canvas
};