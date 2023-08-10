const crypto = require("crypto");
const { Client } = require("./index.js");

const random = crypto.randomBytes(16).toString("hex");

const client = new Client({
	name: "Skribbler"
});

client.on("connect", () => {
	console.log("Logged into lobby.");

	client.sendMessage(random);
});

client.on("text", (data) => {
	if(data.msg === random) {
		console.log(`Successfully recieved random string!`);
		process.exit(0);
	}
});

client.on("disconnect", (reason) => {
	console.error("Bot got kicked.");
	console.error(reason);
	process.exit(1);
});