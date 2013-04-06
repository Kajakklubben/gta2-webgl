// We should create one of this for each from to send the data.
// It should have a delta function for compression


(function(){
	GTA.namespace("GTA.game");
	//constructor

	GTA.game.Game = function() {
		this.levelState = new GTA.model.LevelState();
		this.lastTime= -1;
		return this;
	};

	//Public events
	GTA.game.Game.prototype.OnLoadedData =  function(){}
	GTA.game.Game.prototype.OnAddedPlayer =  function(player){}
	GTA.game.Game.prototype.OnRemovedPlayer =  function(player){}

	//functions

	GTA.game.Game.prototype.StartLoading = function()
	{
		this.loader = new GTA.core.Loader();
        var context = this;
        this.loader.LoadData(function()
        	{
        		//done loading;
        		context.loader.loading = false;
        		context.OnLoadedData();
        	});
    }
	GTA.game.Game.prototype.start = function()
	{
		var ptr = this; 
		setInterval(function() {ptr.update(false)},1000/30);
	}
	
	GTA.game.Game.prototype.update = function(deltaTime)
	{
		if(this.loader != undefined && this.loader.loading)
		{
			return;
		}
		if(!deltaTime)
		{
			deltaTime = (Date.now()-this.lastTime) /1000;
		}
		for(var i in this.levelState.players)
		{
			this.levelState.players[i].update(deltaTime);
		}

		
		this.lastTime= Date.now();
	}

	GTA.game.Game.prototype.addPlayer = function(client)
	{
		var player = new GTA.model.PlayerEntity(client);
		player.id = client.id;
		this.levelState.players.push(player);

		this.OnAddedPlayer(player);

		return player;
	}

	GTA.game.Game.prototype.removePlayer = function(id)
	{
		for(var p in this.levelState.players)
		{
			if(this.levelState.players[p].id == id)
			{
				this.OnRemovedPlayer(p)
				
				this.levelState.players[p].destroy();

				this.levelState.players.splice(p,1);
			}
		}
	}

	GTA.game.Game.prototype.toJson = function()
	{
		return this.levelState.toJson();
	}
	
	GTA.game.Game.prototype.initFromJson = function(json)
	{
		for(var i in json.players)
		{
			console.log('new player');
			var client = new Object(); //we don't send the whole client.
			client.id = json.players[i].id;
			var newPlayer = this.addPlayer(client);
			this.OnAddedPlayer(newPlayer);
			
		}
		this.levelState.fromJson(json);
	}

	GTA.game.Game.prototype.fromJson = function(json)
	{
		this.levelState.fromJson(json);
	}




	//Get as delta encoded string

})();