// @ts-check
const { Proxy } = require("skribbler");

const proxy = new Proxy();

proxy.on("playerJoin", (player) => {
	player.on("connect", () => {
		console.log("Player connected!");
	});

	player.on("incoming", (name, args) => {
		console.log(name, args);

		if(args.id === 30) {
			args.data.msg = "This message has been overwritten";
		}
	});

	player.on("outgoing", (name, args) => {
		console.log(name, args);

		if(args.id === 30) args.data = "I didnt say this.";

		// Player is always alerted of spaming
		player.sendOutbound(32);
	});

	player.on("disconnect", () => {
		console.log("Disconnected :/");
	});
});