// @ts-check
const { Client, Constants } = require("skribbler");

const client = new Client({
	createPrivateRoom: true
});

client.on("connect", () => {
	console.log(`Created private room. Link: https://skribbl.io/?${client.lobbyId}`);
});

client.on("text", (data) => {
	console.log(`[${data.player.name}] ${data.msg}`);
});

client.on("stateUpdate", (data) => {
	switch(data.state) {
		// When given a chance to choose a word to draw, the bot will select the 2nd word
		case Constants.GameState.USER_PICKING_WORD: {
			if(!data.words) break;

			console.log(`Selected ${data.words[1]} to draw!`);
			client.selectWord(data.words[1]);
			break;
		}

		// Once the bot can draw, it will draw random stuff and then undo it
		case Constants.GameState.CAN_DRAW: {
			if(client.currentDrawer.id !== client.userId) break;

			console.log("Drawing... now!");
			client.draw([[0,1,32,108,82,108,82],[0,1,6,108,82,117,82]]);
			client.draw([[0,1,32,546,393,588,373],[0,1,6,588,373,627,354],[0,1,6,627,354,648,345]]);

			setInterval(() => {
				client.undo();
			}, 1000);
		}
	}
});

client.on("disconnect", (reason) => {
	console.log(reason);
});