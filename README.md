# Skribbler
Skribbler is a wrapper for the Skribbl.io networking protocol that allows the creation of headless clients that can join Skribbl.io game servers.
## Client
The Skribbler Client is able to join a skribbl.io lobby and mimic as a real player. It supports sending chat messages, creating drawings, performing moderation actions such as kicking and banning players, and pretty much everything else that a normal player can do. It has complete coverage of the Skribbl.io protocol and is able to keep track of the game state. It is built to be resilient and offer an easy-to-use API.

### Example
The following code will automatically create a private lobby, and output the lobby's link to the console for you to join. Upon joining, you can send a message to the in-game chat which will be relayed to the console.
```js
const { Client } = require("skribbler");

const client = new Client({
	createPrivateRoom: true
});

client.on("connect", () => {
	console.log(`Created private room. Link: https://skribbl.io/?${client.lobbyId}`);
});

client.on("text", (data) => {
	console.log(`[${data.player.name}] ${data.msg}`);
});
```

There are also other examples in the `examples` folder within this repository that show more advanced features, such as automatically starting the game when a player joins, selecting a word to draw, and even creating a drawing!

## Proxy
The Proxy is a lower-level tool that stands in middle of the connection between your client and a Skribbl game server. It can be used to log and modify packets sent by either the client or the server to assist with researching the game's protocol.

The game's networking protocol is currently being documented [here](https://gist.github.com/MrDiamond64/b2081f2cb4ca6d11e848edaeb5ae1814).