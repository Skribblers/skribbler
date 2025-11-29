// @ts-check
const { Client, DrawBuilder, GameState, Colors, BrushSize } = require("skribbler");

const client = new Client({
	name: "Skribbler"
});

client.on("connect", () => {
	console.log("Connected!");
});

client.on("text", (data) => {
	console.log(`[${data.player.name}] ${data.msg}`);
});

client.on("stateUpdate", (data) => {
	switch(data.state) {
		// When given a chance to choose a word to draw, the bot will select the 2nd word
		case GameState.USER_PICKING_WORD: {
			if(!data.words) break;

			console.log(`Selected ${data.words[1]} to draw!`);
			client.selectWord(data.words[1]);
			break;
		}

		// Once the bot can draw, it will draw random stuff and then undo it
		case GameState.START_DRAW: {
			if(!client.canvas.canDraw) break;

			console.log("Drawing... now!");
			const drawData = new DrawBuilder()
				.fill(Colors.LIME, 0, 0)
				.draw(Colors.RED, BrushSize.EXTRA_LARGE, 20, 20, 100, 120)
				.draw(Colors.PINK, BrushSize.MEDIUM, 546, 234, 800, 700)
				.draw(Colors.BLACK, BrushSize.EXTRA_SMALL, 0, 0, 900, 900)
				.fill(Colors.CYAN, 100, 1);
			
			client.canvas.draw(drawData);

			const interval = setInterval(() => {
				// If there are no more commands left to undo then stop the interval
				if(client.canvas.drawCommands.length === 0) return clearInterval(interval);

				client.canvas.undo();
			}, 1000);
			break;
		}
	}
});

client.on("disconnect", (reason) => {
	console.log(reason);
});