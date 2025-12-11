const crypto = require("crypto");
const { Client, Proxy, Packets } = require("skribbler");

const random1 = crypto.randomBytes(16).toString("hex");
const random2 = crypto.randomBytes(16).toString("hex");

const proxy = new Proxy({
	port: 5732
});

proxy.on("playerJoin", (player) => {
	console.log("Client joined the skribbl Proxy");

	player.on("outgoing", (name, args) => {
		if(args.id === Packets.TEXT) args.data += random2;
	});
});

const client = new Client({
	name: "Skribbler",
	serverUrl: "http://localhost:5732"
});

client.on("connect", () => {
	console.log("Client has logged into a lobby");

	client.sendMessage(random1);
});

client.on("text", (data) => {
	if(data.msg === `${random1}${random2}`) {
		console.log(`Successfully received random string!`);
		process.exit(0);
	}
});

setInterval(() => {
	console.error(`Did not recieve "${random1}${random2}" after 10000ms`);
	process.exit(1);
}, 10000);

client.on("disconnect", (reason) => {
	console.error("Bot got kicked.");
	console.error(reason);
	process.exit(1);
});