const events = require("events");
const { Socket } = require("socket.io-client");

declare module "skribbler" {
	export interface ClientOptions {
		name?: String
		avatar?: Array
		lobbyCode?: String
		createPrivateRoom?: Boolean
		language?: Number
		httpHeaders?: Object
	}

	export class Client extends events{
		constructor(options: ClientOptions)

		options: ClientOptions
		socket: Socket

		lobbyId?: String
		settings: Object
		userId?: Number
		ownerId?: Number
		players: Array

		init(): void
		sendPacket(id: Number, data?: Any): void
		hostKick(userId: Number): void
		hostBan(userId: Number): void
		votekick(userId: Number): void
		imageVote(id: String | Number): void
		updateRoomSettings(settingId: String, val: String): void
		draw(data: Array): void
		clearCanvas(): void
		undo(id: Number): void
		startGame(): void
		sendMessage(msg: String): void
		disconnect(): void
	}
}