import { Server } from "socket.io";
import { Socket } from "socket.io-client";

import * as events from "events";

declare module "skribbler" {
	export type Vote = "like" | "dislike"
	export type ClientEvents = "connect" | "packet" | "disconnect" | "playerJoin" | "playerLeave" | "hintRevealed" | "playerGuessed" | "closeWord" | "newOwner" | "draw" | "clearCanvas" | "text" | "roundStart" | "chooseWord" | "canDraw" | "undo" | "vote" | Number

	export interface ClientOptions {
		name?: String
		avatar?: Array<Number>
		lobbyCode?: String
		createPrivateRoom?: Boolean
		language?: Number | String
		serverURL?: String
		httpHeaders?: Object
		socketOptions?: Object
	}

	export interface PlayerObject {
		id: Number
		name: String
		avatar: Array<Number>
		score: Number
		guessed: Boolean
		flags: Number
	}

	export interface LobbySettings {
		language?: Number
		maxPlayers?: Number
		maxDrawTime?: Number
		maxRounds?: Number
		wordCount?: Number
		maxHints?: Number
		wordMode?: Number
		useCustomWords?: Boolean
	}

	export class Client extends events {
		constructor(options?: ClientOptions)

		options: ClientOptions
		socket?: Socket
		connected: Boolean

		lobbyId?: String
		settings: LobbySettings

		state?: Number
		round: Number

		userId?: Number
		ownerId?: Number
		players: Array<PlayerObject>
		time: Number
		currentDrawer?: PlayerObject
		availableWords: Array<String>
		canvas: Array<Array<Number>>

		init(): void
		sendPacket(id: Number, data?: any): void
		hostKick(userId: Number): void
		hostBan(userId: Number): void
		votekick(userId: Number): void
		vote(id: Number | Vote): void
		updateRoomSettings(settingId: String, val: String): void
		draw(data: Array<Array<Number>>): void
		clearCanvas(): void
		undo(id?: Number): void
		startGame(customWords?: Array<String>): void
		endGame(): void
		selectWord(word: Number | String): void
		sendMessage(msg: String): void
		disconnect(): void
		on(event: ClientEvents, listener: Function): this
	}

	type ProxyEvents = "playerJoin"

	export class ProxyOptions {
		port?: Number
		lobbyCode?: String
		language?: Number | String
		serverURL?: String
		httpHeaders?: Object
	}

	export class Proxy extends events {
		constructor(options?: ClientOptions)

		options: ProxyOptions

		init(): void
		on(event: ProxyEvents, callback: Function): this
	}

	type ProxyPlayerEvents = "connect" | "incoming" | "outgoing" | "disconnect"

	export class ProxyPlayer extends events {
		constructor(client: Socket, server: Server)

		upstream: Server
		socket: Socket

		connected: Boolean

		sendOutbound(id: Number, data?: any): void
		sendInbound(id: Number, data?: any): void
		disconnect(): void
		on(event: ProxyPlayerEvents, callback: Function): this
	}
}