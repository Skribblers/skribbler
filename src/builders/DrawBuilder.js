const { Tools } = require("../constants.js");

class DrawBuilder {
    // This can have eight commands at most without the server blocking the draw packet
    drawCommands = [];

    draw(color, brushSize, startX, startY, endX, endY) {
        this.drawCommands.push([ Tools.PENCIL, color, brushSize, startX, startY, endX, endY ]);

        return this;
    }

    fill(color, startX, startY) {
        this.drawCommands.push([ Tools.FILL, color, startX, startY ]);

        return this;
    }

    toValue() {
        return this.drawCommands;
    }
}

module.exports = {
    DrawBuilder
};