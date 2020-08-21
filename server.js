const https = require("https");
const http = require("http");
const axios = require("axios");
const express = require("express"),
    app = express(),
    port = process.env.PORT || 5001;
const cors = require("cors");
app.use(cors);

const server = express().listen(port, () =>
    console.log(`Listening on ${port}`)
);

const io = require("socket.io")(server);
const providerToken =
    process.env.PROVIDER_TOKEN || require("./config/keys").PROVIDER_TOKEN;

let url;
let clients = {};
let providerSocket;

if (process.env.NODE_ENV != "production") url = require("./config/keys").URL;
else url = "https://stream-goal.herokuapp.com/";

const updateProgress = (channel, progress, amount) => {
    const totalProgress = progress + amount;

    axios.post(`${url}api/goal/updateProgress/${channel}`, {
        progress: totalProgress,
    });
};

const minutesToSeconds = (minutes) => {
    return minutes * 60000;
};

//Pings the server if there are active clients.
//This should keep the server from falling asleep while the bar is visible.
//TODO: Remove this functionality when paying for server to remain active.
const emitPing = () => {
    if (Object.keys(clients).length > 0) {
        console.log("EMITTING PING");
        providerSocket.emit("test_connection", {});
    }
};

//Parses the response of the http/https request and emits the amount to the right clients.
const emitAmount = (res, amount) => {
    res.setEncoding("utf8");
    res.on("data", (data) => {
        const accessToken = JSON.parse(data).accessToken;
        const progress = JSON.parse(data).progress;
        const channel = JSON.parse(data).channel;

        updateProgress(channel, progress, amount);

        clients[accessToken].forEach((socket) => {
            socket.emit("event", { amount: amount });
        });
    });
};

//Handles any event messages from the Node.js backend.
//eventData is structured as: {token: token, amount: amount}
const handleSocketEvent = (eventData) => {
    const token = eventData.token;
    const amount = eventData.amount;

    if (url.startsWith("http://")) {
        //dev
        http.get(`${url}api/goal/channelInfo/${token}`, (res) => {
            emitAmount(res, amount);
        });
    } else {
        //production
        https.get(`${url}api/goal/channelInfo/${token}`, (res) => {
            emitAmount(res, amount);
        });
    }
};

//Removes socket from the client object.
//Returns the number of the clients connected to the token.
const removeClient = (clients, socket_id) => {
    for (let i = 0; i < clients.length; i++) {
        if (clients[i].id == socket_id) {
            clients.splice(i, 1);
            break;
        }
    }

    return clients.length;
};

io.on("connect", (socket) => {
    const token = socket.handshake.query.token; //token to match user
    const provider = socket.handshake.query.provider; //token to determine the provider socket.
    const login = socket.handshake.query.login; //boolean for a login request
    const code = socket.handshake.query.code; //login code from twitch
    const redirectUri = socket.handshake.query.redirectUri; //redirect code for twitch login
    const refresh = socket.handshake.query.refresh; //boolean for a refresh on the displayed goal bars.

    if (providerToken == provider) {
        //Set up providerSocket
        providerSocket = socket;

        providerSocket.on("event", (eventData) => {
            handleSocketEvent(eventData);
        });

        providerSocket.on("disconnect", () => {
            console.log("providerSocket disconnected!");
        });

        console.log("providerSocket connected!");
    } else if (login == "true" && code !== null && redirectUri !== null) {
        //Login attempt
        const CLIENT_SECRET =
            process.env.CLIENT_SECRET || require("./config/keys").CLIENT_SECRET;
        const CLIENT_ID =
            process.env.CLIENT_ID || require("./config/keys").CLIENT_ID;

        const accessUrl = `https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&code=${code}&grant_type=authorization_code&redirect_uri=${redirectUri}`;

        try {
            axios
                .post(`${accessUrl}`)
                .then((res) => res["data"]["access_token"])
                .then((token) => {
                    socket.emit("userInfo", { token: token });
                });
        } catch (err) {}
    } else if (refresh == "true" && token != null) {
        socket.on("refresh", () => {
            clients[token].forEach((socket) => {
                socket.emit("refresh");
            });
        });
    } else {
        //Client connected
        //Set up clientSockets
        if (clients[token] == null) {
            if (token != null) clients[token] = [socket];
        } else clients[token].push(socket);

        socket.on("disconnect", () => {
            const client_token = socket.handshake.query.token;
            const new_length = removeClient(clients[client_token], socket.id);

            if (new_length == 0) {
                delete clients[client_token];
            }

            console.log("a user disconnected!");
        });

        console.log("a user connected!");
    }
});

//Ping the server every 5 minutes.
setInterval(emitPing, minutesToSeconds(5));
