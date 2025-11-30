import { Server } from "socket.io";
import { Socket } from "socket.io-client";

import * as events from "events";

declare module "skribbler" {
	export enum Packets {
		PLAYER_JOIN = 1,
		PLAYER_LEAVE,
		HOST_KICK,
		HOST_BAN,
		VOTEKICK,
		REPORT,
		MUTE,
		VOTE,
		UPDATE_AVATAR,
		LOBBY_DATA,
		UPDATE_GAME_STATE,
		UPDATE_SETTINGS,
		REVEAL_HINT,
		UPDATE_TIME,
		PLAYER_GUESSED,
		CLOSE_WORD,
		SET_OWNER,
		SELECT_WORD,
		DRAW,
		CLEAR_CANVAS,
		UNDO,
		START_GAME,
		END_GAME,
		TEXT = 30,
		GAME_START_ERROR,
		SPAM_DETECTED,
		UPDATE_NAME = 90
	}

	export enum Language {
		ENGLISH = 0,
		GERMAN,
		BULGARIAN,
		CZECH,
		DANISH,
		DUTCH,
		FINNISH,
		FRENCH,
		ESTONIAN,
		GREEK,
		HEBREW,
		HUNGARIAN,
		ITALIAN,
		JAPANESE,
		KOREAN,
		LATVIAN,
		MACEDONIAN,
		NORWEGIAN,
		PORTUGUESE,
		POLISH,
		ROMANIAN,
		RUSSIAN,
		SERBIAN,
		SLOVAKIAN,
		SPANISH,
		SWEDISH,
		TAGALOG,
		TURKISH
	}

	export enum LobbyType {
		PUBLIC = 0,
		PRIVATE
	}

	export enum LeaveReason {
		DISCONNECT = 0,
		KICKED,
		BANNED
	}

	export enum JoinError {
		ROOM_NOT_FOUND = 1,
		ROOM_FULL,
		KICK_COOLDOWN,
		BANNED_FROM_ROOM,
		JOINING_ROOMS_TOO_QUICKLY,
		ALREADY_CONNECTED = 100,
		TOO_MANY_IP_CONNECTIONS = 200,
		KICKED_TOO_MANY_TIMES = 300
	}

	export enum GameState {
		WAITING_FOR_PLAYERS = 0,
		GAME_STARTING_SOON,
		CURRENT_ROUND,
		USER_PICKING_WORD,
		START_DRAW,
		DRAW_RESULTS,
		GAME_RESULTS,
		IN_GAME_WAITING_ROOM
	}

	export enum GameStartError {
		NOT_ENOUGH_PLAYERS = 0,
		SERVER_RESTART_SOON = 100
	}

	export enum DrawResultsReason {
		EVERYONE_GUESSED = 0,
		TIME_IS_UP,
		DRAWER_LEFT
	}

	export enum WordMode {
		NORMAL = 0,
		HIDDEN,
		COMBINATION
	}

	export enum Vote {
		DISLIKE = 0,
		LIKE
	}

	export enum Tools {
		PENCIL = 0,
		FILL
	}

	export enum BrushSize {
		EXTRA_SMALL = 4,
		SMALL = 10,
		MEDIUM = 20,
		LARGE = 32,
		EXTRA_LARGE = 40
	}

	export enum Colors {
		WHITE = 0,
		BLACK,
		GRAY,
		DARK_GRAY,
		RED,
		DARK_RED,
		ORANGE,
		DARK_ORANGE,
		YELLOW,
		DARK_YELLOW,
		LIME,
		DARK_GREEN,
		MINT,
		DARK_MINT,
		CYAN,
		DARK_CYAN,
		BLUE,
		DARK_BLUE,
		MAGENTA,
		DARK_MAGENTA,
		PINK,
		DARK_PINK,
		PEACH,
		DARK_PEACH,
		BROWN,
		DARK_BROWN
	}

	export type ClientEvents = "connect" | "packet" | "disconnect" | "playerJoin" | "playerLeave" | "hintRevealed" | "playerGuessed" | "closeWord" | "newOwner" | "draw" | "clearCanvas" | "text" | "undo" | "vote" | "votekick" | "startError" | "stateUpdate" | Number

	export interface ClientOptions {
		name?: String
		avatar?: Array<Number>
		lobbyCode?: String
		createPrivateRoom?: Boolean
		language?: Language
		serverUrl?: String
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
		language?: Language
		maxPlayers?: Number
		maxDrawTime?: Number
		maxRounds?: Number
		wordCount?: Number
		maxHints?: Number
		wordMode?: WordMode
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

		lobbyType?: LobbyType

		players: Array<ClientPlayer>
		time: Number
		currentDrawer: ClientPlayer | null
		availableWords: Array<String>
		canvas: Canvas
		word: String

		// Getter values
		readonly isHost: Boolean

		init(): void
		sendPacket(id: Number, data?: any): void
		vote(voteType: Vote): void
		updateSetting(settingId: String | Number, val: String | Number): void
		startGame(customWords?: Array<String>): void
		endGame(): void
		selectWord(word: String | Number): void
		sendMessage(msg: String): void
		disconnect(): void
		on(event: ClientEvents, listener: Function): this
	}

	export class ClientPlayer {
		constructor(player: PlayerObject, client: Client)
		client: Client

		id: Number
		name: String
		avatar: Array<Number>
		score: Number
		guessed: Boolean
		flags: Number

		// Getter values
		readonly isHost: Boolean
		readonly isDrawer: Boolean
		readonly isAdmin: Boolean

		kick(): void
		ban(): void
		votekick(): void
		report(reason: Number | ReportBuilder): void
	}

	export class Canvas {
		constructor(client: Client)
		client: Client

		drawCommands: Array<Array<Number>>
		readonly canDraw: Boolean

		draw(data: DrawBuilder | Array<Array<Number>>): void
		clear(): void
		undo(id?: Number): void
	}

	type ProxyEvents = "playerJoin"

	export class ProxyOptions {
		port?: Number
		serverUrl?: String
		httpHeaders?: Object
	}

	export class Proxy extends events {
		constructor(options?: ProxyOptions)

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

	export class ReportBuilder {
		bitfield: Number

		inappropriateBehavior: Boolean
		spam: Boolean
		cheating: Boolean

		toValue(): Number
	}

	export class DrawBuilder {
		drawCommands: Array<Array<Number>>

		draw(color: Colors, brushSize: BrushSize, startX: Number, startY: Number, endX: Number, endY: Number): DrawBuilder
		fill(color: Colors, startX: Number, startY: Number): DrawBuilder

		toValue(): Array<Array<Number>>
	}
}