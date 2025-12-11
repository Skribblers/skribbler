// @ts-check
const { Proxy, Packets } = require("skribbler");

const proxy = new Proxy();

proxy.on("playerJoin", (player) => {
	player.on("connect", () => {
		console.log("Player connected!");
	});

	player.on("incoming", (name, args) => {
		console.log(name, args);

		if(args.id === Packets.TEXT) {
			args.data.msg = "This message has been overwritten";
		}
	});

	player.on("outgoing", (name, args) => {
		console.log(name, args);

		if(args.id === Packets.TEXT) args.data = "I didnt say this.";

		// Player is always alerted of spaming
		player.sendInbound(Packets.SPAM_DETECTED);
	});

	player.on("disconnect", () => {
		console.log("Disconnected :/");
	});
});