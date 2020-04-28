const https = require("https");
const http = require("http");
const request = require("request");
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

    request.post(`${url}api/goal/updateProgress/${channel}`, {
        json: { progress: totalProgress },
    });
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

io.on("connect", (socket) => {
    const token = socket.handshake.query.token;
    const provider = socket.handshake.query.provider;

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
    } else {
        //Set up clientSockets
        if (clients[token] == null) {
            if (token != null) clients[token] = [socket];
        } else clients[token].push(socket);

        console.log(socket.handshake.query.token);
        console.log(socket.handshake.query.provider);

        socket.on("disconnect", () => {
            console.log("a user disconnected!");
        });

        console.log("a user connected!");
    }
});
