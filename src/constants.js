const Packets = {
    "PLAYER_JOIN": 1,
    "PLAYER_LEAVE": 2,
    "HOST_KICK": 3,
    "HOST_BAN": 4,
    "VOTEKICK": 5,
    "REPORT": 6,
    "MUTE": 7,
    "VOTE": 8,
    "LOBBY_DATA": 10,
    "UPDATE_GAME_DATA": 11,
    "UPDATE_SETTINGS": 12,
    "REVEAL_HINT": 13,
    "UPDATE_TIME": 14,
    "PLAYER_GUESSED": 15,
    "CLOSE_WORD": 16,
    "SET_OWNER": 17,
    "SELECT_WORD": 18,
    "DRAW": 19,
    "CLEAR_CANVAS": 20,
    "UNDO": 21,
    "REQUEST_GAME_START": 22,
    "END_GAME": 23,
    "TEXT": 30,
    "GAME_START_ERROR": 31,
    "SPAM_DETECTED": 32
};

const LobbyType = {
    "PUBLIC": 0,
    "PRIVATE": 1
};

const LeaveReason = {
    "DISCONNECT": 0,
    "KICKED": 1,
    "BANNED": 2
};

const GameState = {
    "WAITING_FOR_PLAYERS": 0,
    "GAME_STARTING_SOON": 1,
    "CURRENT_ROUND": 2,
    "USER_PICKING_WORD": 3,
    "CAN_DRAW": 4,
    "DRAW_RESULTS": 5,
    "GAME_RESULTS": 6,
    "IN_GAME_WAITING_ROOM": 7
};

module.exports = {
    LobbyType,
    LeaveReason,
    Packets,
    GameState
};