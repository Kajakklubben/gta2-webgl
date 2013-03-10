




//Special local player that can do more

var Test = Class(function() {
    Maple.Client(this, 30, 60);

}, Maple.Client, {


    input: new GTA.Input.Keyboard(),
    game: false,
    player: false,
    render: false,
    initGame: function()
    {
        this.input.attachEvents(); //start listening on input
        var context = this;
        this.game = new GTA.game.Game();
        this.game.OnLoadedData = function()
        {
            context.renderer = new GTA.client.Render(context.game);
            context.renderer.Init();
        }
        this.game.StartLoading();

        this.connect(GTA.Constants.SERVER_SETTING.SOCKET_DOMAIN, GTA.Constants.SERVER_SETTING.SOCKET_PORT);

    },
    started: function() {
        this.log('Client started');
        
        

    },

    update: function(t, tick) {
      
        
    },
    inputState: 0,
    render: function(t, dt, u) {

    var newInput  = this.input.constructInputBitmask();
    
    if(newInput != this.inputState)
    {
      this.inputState = newInput;

      this.send(GTA.Constants.MESSAGE_TYPES.INPUT, [this.inputState]);
    }
    },

    stopped: function() {
        this.log('Stopped');
    },

    connected: function() {
        this.log('Connection established');
    },
    lasttick: 0,
    message: function(type, tick, data) {
   if(type == GTA.Constants.MESSAGE_TYPES.SYNC)
      {
       
          this.game.fromJson(data[0]);
          this.lasttick = tick;
      }
       
    },

    syncedMessage: function(type, tick, data) {
        //this.log('Synced message received:', type, data);

       if(type == GTA.Constants.MESSAGE_TYPES.STARTSYNC)
        {
            console.log("init from json:"+JSON.stringify(data));
           this.game.initFromJson(data[0]);
            

        }

        if(type == GTA.Constants.MESSAGE_TYPES.ADDPLAYER)
        {
            console.log("added some player")
            var newPlayer = this.game.addPlayer(this);
            newPlayer.fromJson(data[0]);
           

        }
        if(type == GTA.Constants.MESSAGE_TYPES.ADDCLIENTPLAYER)
        {
            console.log("added my player")
            var newPlayer = this.game.addPlayer(this);
            newPlayer.fromJson(data[0]);
            this.player = newPlayer;
           
        }

        if(type == GTA.Constants.MESSAGE_TYPES.REMOVEPLAYER)
        {
            
           this.game.removePlayer(data[0].id);

        }
    },

    closed: function(byRemote, errorCode) {
        this.log('Connection closed:', byRemote, errorCode);
    }

});

var client = new Test();
client.initGame();
