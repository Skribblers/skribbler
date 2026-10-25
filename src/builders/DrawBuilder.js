// @ts-check
import { Tools } from "../constants.js";

export class DrawBuilder {
    // This can have eight commands at most without the server blocking the draw packet
    /**
     * @type {Number[][]}
     */
    drawCommands = [];


    /**
     * @param {number} color
     * @param {number} brushSize
     * @param {number} startX
     * @param {number} startY
     * @param {number} endX
     * @param {number} endY
     */
    draw(color, brushSize, startX, startY, endX, endY) {
        this.drawCommands.push([ Tools.PENCIL, color, brushSize, startX, startY, endX, endY ]);

        return this;
    }

    /**
     * @param {number} color
     * @param {number} startX
     * @param {number} startY
     */
    fill(color, startX, startY) {
        this.drawCommands.push([ Tools.FILL, color, startX, startY ]);

        return this;
    }

    toValue() {
        return this.drawCommands;
    }
}