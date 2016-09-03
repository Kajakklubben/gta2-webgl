var statusview = new GTA.Client.StatusView();

var Client = Class(function() {
    Maple.Client(this, 30, 60);

}, Maple.Client, {
	
    game: false, 		//Core.Game
    renderer: false,	//Client.Render
    player: false,		//Model.PlayerEntity
    input: new GTA.Input.Keyboard(),

	//
	// Initializer
	//
    initClient: function()
    {
       
        var context = this;
        this.game = new GTA.Core.Game();

        this.game.OnLoadedData = function()
        {
            context.renderer = new GTA.Client.Render(context.game);
		    context.renderer.Init(context.game.maploader.level, context.game.maploader.style);

          	
			if(GTA.Constants.DEBUG_SETTING.DRAW_COLLISION_MAP)
			  context.game.loader.collisionMap.SetupDebugRender(context.renderer.scene); //Enable this to debug collision map

            context.connect(GTA.Constants.SERVER_SETTING.SOCKET_DOMAIN, GTA.Constants.SERVER_SETTING.SOCKET_PORT);

        }
        this.game.StartLoading(true); 


    },
   
    started: function() {
         this.input.attachEvents(); //start listening on input
    },

    update: function(t, tick) {
        
    },
    
	inputState: 0,
    inputStates: [],
   
   
    render: function(t, dt, u) {
    	var newInput  = this.input.constructInputBitmask();
    
        if(newInput != this.inputState)
        {
          this.inputState = newInput;

          this.send(GTA.Constants.MESSAGE_TYPES.INPUT, [this.inputState]);
        }
        if(this.renderer)
        {
            this.renderer.update();
        }

        this.game.update(false);
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
			this.lasttick = tick;
			future = this.input.getFuture(tick);
			//revert all movement by future
			this.player.revert(future);
			//set current position
			this.game.fromJson(data[0]);
			//apply future movement
			//this.player.play(future);
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
			newPlayer.isLocal = false;
        }
        if(type == GTA.Constants.MESSAGE_TYPES.ADDCLIENTPLAYER)
        {
            console.log("added my player")
            var newPlayer = this.game.addPlayer(this, this.input);
			newPlayer.isLocal = true;
            newPlayer.fromJson(data[0]);
            this.player = newPlayer;
            this.renderer.followTarget = newPlayer.render;
           
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

var client = new Client();
client.initClient();

var keyboardinclient;