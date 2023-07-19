// @ts-check
const { Client } = require("skribbler");

const client = new Client({
	createPrivateRoom: true
});

client.on("connected", () => {
	console.log(`Created private room. Link: https://skribbl.io/?${client.lobbyId}`);
});

client.on("text", (data) => {
	console.log(`[${data.player.name}] ${data.msg}`);
});

client.on("disconnect", (reason) => {
	console.log(reason);
});