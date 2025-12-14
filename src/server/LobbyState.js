// @ts-check
const { Packets, Settings, GameState } = require("../constants.js");

// eslint-disable-next-line no-unused-vars
const { ServerPlayer } = require("./ServerPlayer.js");

class LobbyState {
    id = GameState.WAITING_FOR_PLAYERS;
    time = 0;

    round = 0;
    /**
     * @description The ServerPlayer class
     * @type {ServerPlayer | null}
     */
    drawer = null;

    /**
     * @description List of players who voted to kick someone out
     * @type {Set<Number>}
     */
    votekicks = new Set();

    /**
     * @description A list of players queued to be the drawer
     * @type {Array<ServerPlayer>}
     */
    drawerQueue = [];

    word = "";
    /**
     * @description A list of words that the drawer can choose from
     * @type {Array<String>}
     */
    availableWords = [];

    /**
     * @description A list of draw commands sent by the drawer
     * @type {Array<Array<Number>>}
     */
    drawCommands = [];

    /**
     * @type {any}
     */
    _timeout;

    /**
     * @class
     * @param {any} lobby - Referencing Lobby
     */
    constructor(lobby) {
        this.lobby = lobby
    }

    /**
     * @description Get data for the current state that should be sent in the LobbyData packet
     */
    _currentStateData() {
        switch(this.id) {
            case GameState.WAITING_FOR_PLAYERS:
            case GameState.GAME_STARTING_SOON:
            case GameState.CURRENT_ROUND:
            case GameState.IN_GAME_WAITING_ROOM:
                return {
                    id: this.id,
                    time: this.time,
                    data: 0
                }

            case GameState.USER_PICKING_WORD:
                return {
                    id: this.id,
                    time: this.time,
                    data: {
                        id: this.drawer?.id
                    }
                }
            
            case GameState.START_DRAW:
                return {
                    id: this.id,
                    time: this.time,
                    data: {
                        id: this.drawer?.id,
                        word: [ this.word.length ],
                        hints: [],
                        drawCommands: this.drawCommands
                    }
                }
            
            default:
                return;
        }
    }

    _waitForPlayers() {
        this.id = GameState.WAITING_FOR_PLAYERS;
        this.time = 0;

        this.lobby.send(Packets.UPDATE_GAME_STATE, this._currentStateData());
    }

    _gameStartingSoon() {
        this.id = GameState.GAME_STARTING_SOON;
        this.time = 3;

        this.lobby.send(Packets.UPDATE_GAME_STATE, this._currentStateData());

        this._timeout = setTimeout(() => {
            this._newRound();
        }, this.time * 1000);
    }

    /**
     * @param {Number} [round]
     */
    _newRound(round) {
        this.id = GameState.CURRENT_ROUND;
        this.time = 3;

        round ??= this.round;

        this.lobby.send(Packets.UPDATE_GAME_STATE, this._currentStateData());

        this._timeout = setTimeout(() => {
            this._chooseWord();
        }, this.time * 1000);
    }

    _chooseWord() {
        this.id = GameState.USER_PICKING_WORD;
        this.time = 15;

        const words = ["apple", "orange", "banana"];
        this.availableWords = words;

        const drawer = this.drawerQueue.shift();
        if(!drawer) return;

        this.drawer = drawer;

        // Give the drawer a list of words to choose from
        drawer.send(Packets.UPDATE_GAME_STATE, {
            id: this.id,
            time: this.time,
            data: {
                id: drawer.id,
                words
            }
        });

        this.lobby.broadcast(drawer.socket, Packets.UPDATE_GAME_STATE, this._currentStateData());

        // Force the drawer to pick the first word if they did not pick one in time
        this._timeout = setTimeout(() => {
            this.word = words[0];
        }, this.time * 1000);
    }

    _startDraw() {
        this.id = GameState.START_DRAW;
        this.time = this.lobby.settings[Settings.MAX_DRAW_TIME];

        const drawer = this.drawer;
        if(!drawer) return;

        drawer.send(Packets.UPDATE_GAME_STATE, {
            id: this.id,
            time: this.time,
            data: {
                id: drawer.id,
                word: this.word
            }
        });

        this.lobby.broadcast(drawer.socket, Packets.UPDATE_GAME_STATE, this._currentStateData());

        /*
        this._timeout = setTimeout(() => {

        }, this.time * 1000);
        */
    }

    _inGameWaitingRoom() {
        this.id = GameState.IN_GAME_WAITING_ROOM;
        this.time = 0;

        this.lobby.send(Packets.UPDATE_GAME_STATE, this._currentStateData());
    }

    startGame() {
        // Reset votekicks
        this.votekicks.clear();

        for(const obj of this.lobby.players) {
            const player = obj[1];

            player.votekicks = 0;

            this.drawerQueue.push(player);
        }

        this.drawerQueue.reverse();

        this._newRound();
    }

    /**
     * @param {Number} index - The index of the word the user choose
     */
    chooseWord(index) {
        clearTimeout(this._timeout);

        this.word = this.availableWords[index];
        this.availableWords = [];

        this._startDraw();
    }
}

module.exports = { LobbyState };