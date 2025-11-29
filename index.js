// @ts-check
const { Client, ClientPlayer } = require("./src/client/client.js");
const { Proxy, ProxyPlayer } = require("./src/proxy/proxy.js");
const Constants = require("./src/constants.js");

module.exports = {
	Client,
	ClientPlayer,
	Proxy,
	ProxyPlayer,
	Constants
};