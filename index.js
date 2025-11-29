// @ts-check
const { Client } = require("./src/client/client.js");
const { Proxy, ProxyPlayer } = require("./src/proxy/proxy.js");
const Constants = require("./src/constants.js");

module.exports = {
	Client,
	Proxy,
	ProxyPlayer,
	Constants
};