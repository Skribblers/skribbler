const crypto = require("crypto");
const { Client, Proxy } = require("./index.js");

const random1 = crypto.randomBytes(16).toString("hex");
const random2 = crypto.randomBytes(16).toString("hex");

const proxy = new Proxy({
	port: 5732
});

proxy.on("playerJoin", (player) => {
	player.on("outgoing", (name, args) => {
		if(args.id === 30) args.data += random2;
	});
});

const client = new Client({
	name: "Skribbler",
	serverURL: "http://localhost:5732"
});

client.on("connect", () => {
	console.log("Logged into lobby.");

	client.sendMessage(random1);
});

client.on("text", (data) => {
	if(data.msg === `${random1}${random2}`) {
		console.log(`Successfully recieved random string!`);
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