
var Maple = require('../maple/Maple');
require('../core/GTA');

console.log("GTA2 Web Server");

GLOBAL.jDataView = require('../libs/jdataview');
require('../core/MapLoader');
require('../core/MapParser');


require('../core/CollisionMap');

require('../core/Game');
require('../model/Constants');
require('../model/LevelState');
require('../model/EntityState');
require('../model/PlayerEntity');
require('../model/Point');
require('../input/Keyboard');
require('./ClientServer.js');

require('../server/StatusView');
GLOBAL.statusview = new GTA.Server.StatusView();


// Test -----------------------------------------------------------------------
var TestServer = Maple.Class(function(clientClass) {

    Maple.Server(this, clientClass, [
        'echo',GTA.Constants.MESSAGE_TYPES.INPUT,
        GTA.Constants.MESSAGE_TYPES.SYNC,
        GTA.Constants.MESSAGE_TYPES.ADDPLAYER,
        GTA.Constants.MESSAGE_TYPES.ADDCLIENTPLAYER,
        GTA.Constants.MESSAGE_TYPES.REMOVEPLAYER,
        GTA.Constants.MESSAGE_TYPES.STARTSYNC
    ]);

}, Maple.Server, {

    game: new GTA.Core.Game(),

    started: function() {
        this.log('Started');
		this.game.StartLoading();
        this.game.start();
    },

    update: function(t, tick) {
     
       this.broadcast(GTA.Constants.MESSAGE_TYPES.SYNC, [this.game.toJson()]);
     
    },

    stopped: function() {
        this.log('Stopped');
    },

    connected: function(client) {
        
        //First let the client have a full update of what is happening
        console.log('to client');
        this.broadcast(GTA.Constants.MESSAGE_TYPES.STARTSYNC, [this.game.toJson()],[client]);


        this.log('Client has connected:', client.id, client.isBinary);
        client.player = this.game.addPlayer(client);

        //First let the client know that he got a player
        this.broadcast(GTA.Constants.MESSAGE_TYPES.ADDCLIENTPLAYER, [client.player.toJson()],[client]);

        //then everybody else
         this.broadcast(GTA.Constants.MESSAGE_TYPES.ADDPLAYER, [client.player.toJson()],false,[client]);
        
    },

    message: function(client, type, tick, data) {
      //  this.log('New Message received '+data);
        if(type == GTA.Constants.MESSAGE_TYPES.INPUT)
        {
            client.player.setInput(data[0]);
        }
    },

    requested: function(req, res) {
        this.log('HTTP Request');
    },

    disconnected: function(client) {
           this.broadcast(GTA.Constants.MESSAGE_TYPES.REMOVEPLAYER,[{id:client.id}]);
           this.game.removePlayer(client.id);
    }

});


var TestClient = Maple.Class(function(server, conn, isBinary) {
    Maple.ServerClient(this, server, conn, isBinary );

}, Maple.ServerClient, {

    message: function(type, tick, data) {
        //console.log('Client got message:', type, tick, data);
    },
});


var srv = new TestServer(TestClient);
srv.start({
    port: process.env.PORT,
    logicRate: 1 // only update logic and send back every n ticks
});

