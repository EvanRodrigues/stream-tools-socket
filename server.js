const express = require("express"),
    app = express(),
    port = process.env.PORT || 5001;
const cors = require("cors");
app.use(cors);

const http = require("http").createServer(app);
const io = require("socket.io")(http);

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

app.listen(port, () => console.log(`listening on port: ${port}`));
