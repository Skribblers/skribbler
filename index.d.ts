const events = require("events");
const { Socket } = require("socket.io-client");

declare module "skribbler" {
	type Vote = "like" | "dislike"
	type Events = "connected" | "packet" | "disconnect" | "playerJoin" | "playerLeave" | "hintRevealed" | "playerGuessed" | "closeWord" | "newOwner" | "draw" | "clearCanvas" | "text" | Number

	export interface ClientOptions {
		name?: String
		avatar?: Array<Number>
		lobbyCode?: String
		createPrivateRoom?: Boolean
		language?: Number | String
		httpHeaders?: Object
	}

	export class Client extends events {
		constructor(options: ClientOptions)

		options: ClientOptions
		socket: Socket

		lobbyId?: String
		settings: Object
		userId?: Number
		ownerId?: Number
		players: Array<Object>

		init(): void
		sendPacket(id: Number, data?: any): void
		hostKick(userId: Number): void
		hostBan(userId: Number): void
		votekick(userId: Number): void
		imageVote(id: Number | Vote): void
		updateRoomSettings(settingId: String, val: String): void
		draw(data: Array<Array<Number>>): void
		clearCanvas(): void
		undo(id: Number): void
		startGame(): void
		endGame(): void
		sendMessage(msg: String): void
		disconnect(): void

		on(event: Events, callback: Function): void
	}
}