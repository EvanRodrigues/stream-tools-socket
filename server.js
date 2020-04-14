const express = require("express"),
    app = express(),
    port = process.env.PORT || 5001;
const cors = require("cors");
app.use(cors);

const server = express().listen(port, () =>
    console.log(`Listening on ${port}`)
);

const io = require("socket.io")(server);

let clients = {};

io.on("connect", (socket) => {
    const token = socket.handshake.query.token;

    if (clients[token] == null) {
        clients[token] = [socket];
    } else clients[token].push(socket);

    console.log(socket.handshake.query.token);

    socket.on("disconnect", () => {
        console.log("a user disconnected!");
    });

    socket.on("event", (eventData) => {
        console.log(eventData);
    });

    console.log("a user connected!");
});
