import crypto from "crypto";
import { Client, Proxy, Packets } from "skribbler";

const random1 = crypto.randomBytes(16).toString("hex");
const random2 = crypto.randomBytes(16).toString("hex");
let didSucceed = false;

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
		didSucceed = true;

		proxy.close();
		client.disconnect();
	}
});

setTimeout(() => {
	if(didSucceed) return;

	client.disconnect();
	proxy.close();
	throw new Error(`Did not recieve "${random1}${random2}" after 5000ms`);
}, 5000);


client.on("disconnect", (reason) => {
	if(didSucceed) return;

	proxy.close();
	throw new Error(`Bot was disconnected due to ${reason}`);
});