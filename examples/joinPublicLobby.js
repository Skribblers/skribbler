// @ts-check
const { Client } = require("skribbler");

const client = new Client({
	name: "Skribbler"
});

client.on("connect", () => {
	console.log("Connected!");
});

client.on("text", (data) => {
	console.log(`[${data.player.name}] ${data.msg}`);
});

// When given a chance to choose a word to draw, the bot will select the 2nd word
client.on("chooseWord", (words) => {
	console.log(`Selected ${words[1]} to draw!`);
	client.selectWord(words[1]);
});

// Once the bot can draw, it will draw random stuff and then undo it
client.on("canDraw", () => {
	console.log("Drawing... now!");
	client.draw([[0,1,32,108,82,108,82],[0,1,6,108,82,117,82]]);
	client.draw([[0,1,32,546,393,588,373],[0,1,6,588,373,627,354],[0,1,6,627,354,648,345]]);

	setInterval(() => {
		client.undo();
	}, 1000);
});

client.on("disconnect", (reason) => {
	console.log(reason);
});