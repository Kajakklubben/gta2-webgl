var Maple = require('../maple/Maple');
require('../core/GTA');
require('../core/Game');
require('../model/Constants');
//require('../model/LevelState');

var game = GTA.game.Game();
// Test -----------------------------------------------------------------------
var TestServer = Maple.Class(function(clientClass) {

    Maple.Server(this, clientClass, [
        'echo'
    ]);

}, Maple.Server, {

    started: function() {
        this.log('Started');
    },

    update: function(t, tick) {
      game.update();
        if (tick % 50 === 0) {
            this.broadcast('echo', ['Server', tick, this.getRandom()]);
        }
    },

    stopped: function() {
        this.log('Stopped');
    },

    connected: function(client) {
        this.log('Client has connected:', client.id, client.isBinary);
    },

    message: function(client, type, tick, data) {
        this.log('New Message received:', client, type, tick, data);
    },

    requested: function(req, res) {
        this.log('HTTP Request');
    },

    disconnected: function(client) {
        this.log('Client has disconnected:', client.id);
    }

});


var TestClient = Maple.Class(function(server, conn, isBinary) {
    Maple.ServerClient(this, server, conn, isBinary );

}, Maple.ServerClient, {

    message: function(type, tick, data) {
        console.log('Client got message:', type, tick, data);
    }

});


var srv = new TestServer(TestClient);
srv.start({
    port: GTA.Constants.SERVER_SETTING.SOCKET_PORT,
    logicRate: 10 // only update logic every 10 ticks
});

