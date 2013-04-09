// We should create one of this for each from to send the data.
// It should have a delta function for compression


(function(){
	GTA.namespace("GTA.Core");
	//constructor

	GTA.Core.Game = function() {
		
		this.maploader = new GTA.Core.MapLoader();
		
		this.levelState = new GTA.Model.LevelState();

		this.lastTime = -1;

		return this;
	};

	//Public events
	GTA.Core.Game.prototype.OnLoadedData =  function(){}
	GTA.Core.Game.prototype.OnAddedPlayer =  function(player){}
	GTA.Core.Game.prototype.OnRemovedPlayer =  function(player){}

	//functions

	GTA.Core.Game.prototype.StartLoading = function(loadStyle)
	{
        var context = this;
        this.maploader.LoadData(loadStyle,function()
        	{
        		//done loading;
        		context.maploader.loading = false;
        		context.OnLoadedData();
        	});
    }
	GTA.Core.Game.prototype.start = function()
	{
		var ptr = this; 
		setInterval(function() {ptr.update(false)},1000/30);
	}
	
	GTA.Core.Game.prototype.update = function(deltaTime)
	{
		if(this.maploader != undefined && this.maploader.loading)
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

	GTA.Core.Game.prototype.addPlayer = function(client)
	{
		var player = new GTA.Model.PlayerEntity(client, this.maploader.collisionMap);
		player.id = client.id;
		
		this.levelState.players.push(player);

		this.OnAddedPlayer(player);

		return player;
	}

	GTA.Core.Game.prototype.removePlayer = function(id)
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

	GTA.Core.Game.prototype.toJson = function()
	{
		return this.levelState.toJson();
	}
	
	GTA.Core.Game.prototype.initFromJson = function(json)
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

	GTA.Core.Game.prototype.fromJson = function(json)
	{
		this.levelState.fromJson(json);
	}




	//Get as delta encoded string

})();