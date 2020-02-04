// Require the packages we will use:
var http = require("http"),
	socketio = require("socket.io"),
    fs = require("fs");
    
// Listen for HTTP connections.  This is essentially a miniature static file server that only serves our one file, client.html:
var app = http.createServer(function(req, resp){
	// This callback runs when a new connection is made to our HTTP server.
	fs.readFile("client.html", function(err, data){
		// This callback runs when the client.html file has been read from the filesystem.
		if(err) return resp.writeHead(500);
		resp.writeHead(200);
		resp.end(data);
	});
});
app.listen(3456);
//some important global variables.
users=[];
connections=[];
chatrooms=[];
chatrooms.push([]);
chatrooms[0].push("default");
roomsWithPassword = {};
banned = [];
//use this global variable in creating new rooms 
let index = 1;
let bannedIndex = 0;
// Do the Socket.IO magic:
var io = socketio.listen(app);
io.sockets.on("connection", function(socket){
	// This callback runs when a new Socket.IO connection is established.
    connections.push(socket);

    console.log("Connected, total %s connections", connections.length);

	socket.on('message_to_server', function(data) {
		// This callback runs when the server receives a new message from the client.
        if(typeof(data.whisper) !== 'undefined'){ // if we're whispering to someone
            if(data.whisper){
                let recipient = data.recipient;
                //check to see if the user even exists
                if(typeof(users[recipient]) !== 'undefined'){
                     //if sender and receiver are both in the same room, send the message, otherwise don't send a message
                    if(socket.room === users[recipient].room){
                        io.sockets.to(data.curRoom).emit("whisper_to_client",{message:data["message"], sender: socket.username, receiver: recipient})
                    }
                }
            }
        }// deals with kicking people as long as they're in a different room than the default room.
        else if(typeof(data.kick) !== 'undefined' && socket.room != 'default'){
            if(data.kick){
                let recipient = data.recipient;
                //check to see if user exists
                if(typeof(users[recipient]) !== 'undefined'){
                    //check to see if both people are in same room
                    if(socket.room === users[recipient].room){
                        //find the index of the room in the chat array
                        for(i = 0; i < chatrooms.length; i++){
                            if(chatrooms[i][0] == socket.room){
                                //check if the sender of the kick is the owner of the room
                                if(chatrooms[i][1] == socket.username){
                                    //if banning, add the person to the banned array
                                   if(data.ban){
                                     let curIndex = -1;
                                     for(i =0; i < banned.length; i++){
                                        if(banned[0] == socket.room){
                                            curIndex = i;
                                            banned[i].push(users[data.recipient]);
                                            break;
                                        }
                                     }
                                     // if the room is not in the banned array, then add it to it.
                                     if(curIndex == -1){
                                         banned.push([]);
                                         banned[bannedIndex].push(socket.room);
                                         banned[bannedIndex].push(users[data.recipient].username);
                                         bannedIndex++;
                                     }
                                   }
                                    //kick the person by making him join the default room.
                                    //whether we ban or kick, this procedure is the same.
                                   let curSocket = users[data.recipient];
                                   let curRoom =  socket.room;
                                   let newRoom = "default";
                                   console.log(curSocket.username + "  has been kicked/banned and is moving from " + curRoom + " to " + newRoom);
                                   for(i = 0; i < chatrooms.length; i++){
                                       if(chatrooms[i][0] == curRoom){
                                           //remove username from old chat room
                                           chatrooms[i].splice(chatrooms[i].indexOf(curSocket.username),1);
                                           curSocket.leave(curRoom);
                                       }
                                       if(chatrooms[i][0] == newRoom){
                                           //push new user onto the room array 
                                           chatrooms[i].push(curSocket.username);
                                           // set the room type accordingly and join the new room.
                                           curSocket.room = newRoom;
                                           curSocket.join(newRoom);
                                       }
                                   }
                                   io.sockets.emit('get users', {userRooms: chatrooms, curSocketRoom: "default", curSocketUser: curSocket.username, roomPasswords: roomsWithPassword,banList: banned});
                                }
                            }
                        }
                    }
                }
            }
        }
        else{// if its a normal message just emit it right away
            console.log("message: "+data["message"]); // log it to the Node.JS output
            io.sockets.to(data.curRoom).emit("message_to_client", {message:data["message"], curUser: socket.username }) ;// broadcast the message to other users
        }
    });

    socket.on('user login',function(data){
        socket.username = data;
        socket.join("default");
        socket.room ="default";
        users[socket.username] = socket;
        chatrooms[0].push(socket.username);
        console.log(chatrooms);
        updateUsers();
    });

    socket.on('disconnect', function(data){
        // users.splice(users.indexOf(socket.username), 1);
        for(i = 0; i < chatrooms.length;i++){
            if(chatrooms[i][0] == socket.room){
                chatrooms[i].splice(chatrooms[i].indexOf(socket.username), 1);
                // if(chatrooms[i].length == 1 && chatrooms[i][0] != 'default'){
                //     chatrooms.splice(i);
                //     index--;
                // }
                break;  
            }
        }
        delete users[socket.username];
        connections.splice(connections.indexOf(socket), 1);
        console.log(socket.id + ' disconnected, %s sockets connected', connections.length); 

        //reset the global variables if nobody is using the chat
        let empty = true;
        for(i = 0; i < chatrooms.length; i++){
            if(typeof(chatrooms[i]) != 'undefined' && chatrooms[i].length > 1){
                empty = false;
            }
        }
        if(empty){
            users=[];
            chatrooms=[];
            chatrooms.push([]);
            chatrooms[0].push("default");
            roomsWithPassword = {};
            banned = [];
            index = 1;
            bannedIndex = 0;
        }
        updateUsers();
    });

    socket.on('newRoomCreated', function(data){
        console.log(socket.username + " created a new room: " + data.room);
        let roomIndex = -1;
        let curRoom = socket.room;
        //remove the username from the old room.
        for(i = 0; i < chatrooms.length; i++){
            if(chatrooms[i][0] == curRoom){
                roomIndex = i;
                break;
            }
        }    
        socket.leave(socket.room);
        chatrooms[roomIndex].splice(chatrooms[roomIndex].indexOf(socket.username),1);
        //add the new room to the chatrooms array
        chatrooms.push([]);
        chatrooms[index].push(data.room);
        //add username to the new room
        chatrooms[index].push(socket.username);
        //modify the socket.room variable
        socket.room = data.room;
        //finally, join the new room.
        socket.join(data.room);
        //increment index for future room creating
        index++;
        //add room to the password array:
        roomsWithPassword[data.room] = data.roomPassword;
        console.log(chatrooms);
        updateUsers();
    });

    socket.on('joinNewRoom', function(data){
        let curRoom = data.curRoom;
        let newRoom = data.message;

        console.log(socket.username + " is moving from " + curRoom + " to " + newRoom);
        for(i = 0; i < chatrooms.length; i++){
            if(chatrooms[i][0] == curRoom){
                //remove username from old chat room
                chatrooms[i].splice(chatrooms[i].indexOf(socket.username),1);
                socket.leave(curRoom);
            }
            if(chatrooms[i][0] == newRoom){
                //push new user onto the room array 
                chatrooms[i].push(socket.username);
                // set the room type accordingly and join the new room.
                socket.room = newRoom;
                socket.join(newRoom);
            }
        }
        console.log(chatrooms);
        updateUsers();
    });

    socket.on('user image', function (data) {
        console.log("at server side:");
        console.log(data);
        // Broadcast the img to other users
        io.sockets.to(data.curRoom).emit("img_to_client", {image:data["image"], curUser:socket.username});
    });

    socket.on('change_password', function(data) {
        let curSocketRoom = socket.room;
        var password_change = data.roomPassword;
        var room_change = data.room;
        var username1 = data.user;
        if(username1 == owners[room_change]){
            pswRoom[room_change] = password_change;
            io.sockets.in(room_change).emit('change_password', {owner:username1,room:room_change});
        }
        else{
            io.sockets.emit("change_password_error",{sender:username1});
        }
    });

    function updateUsers(){
        io.sockets.emit('get users', {userRooms: chatrooms, curSocketRoom: socket.room, curSocketUser: socket.username, roomPasswords: roomsWithPassword, banList: banned});   
    }
});
