// @ts-check
const { Packets, Settings, GameState, DrawResultsReason } = require("../constants.js");

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
     * @description List of players who voted on an image
     * @type {Set<Number>}
     */
    voters = new Set();

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
     * @description The reason why the draw finished
     * @type {Number | null}
     */
    drawResultsReason = null;

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
        /**
         * @type {any}
         */
        const state = { id: this.id, time: this.time };

        switch(this.id) {
            case GameState.WAITING_FOR_PLAYERS:
            case GameState.GAME_STARTING_SOON:
            case GameState.CURRENT_ROUND:
            case GameState.IN_GAME_WAITING_ROOM:
                state.data = 0;
                break;

            case GameState.USER_PICKING_WORD:
                state.data = {
                    id: this.drawer?.id
                }
                break;
            
            case GameState.START_DRAW:
                state.data = {
                    id: this.drawer?.id,
                    word: [ this.word.length ],
                    hints: [],
                    drawCommands: this.drawCommands
                }
                break;

            case GameState.DRAW_RESULTS:
                state.data = {
                    reason: this.drawResultsReason,
                    word: this.word,
                    scores: []
                }
                break;
        }

        return state;
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
        clearTimeout(this._timeout);

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

        this._timeout = setTimeout(() => {
            this._drawResults(DrawResultsReason.TIME_IS_UP);
        }, this.time * 1000);
    }

    /**
     * @param {Number} reason - Reason why the draw should be finished
     */
    _drawResults(reason) {
        clearTimeout(this._timeout);

        this.id = GameState.DRAW_RESULTS;
        this.time = 5;

        this.drawer = null;
        this.drawResultsReason = reason;
        // Automatically select a word if the drawer did not select one yet
        if(this.word === "") this.word = this.availableWords[0];

        this.lobby.send(Packets.UPDATE_GAME_STATE, this._currentStateData());
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