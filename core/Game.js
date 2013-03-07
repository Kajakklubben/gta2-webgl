// We should create one of this for each from to send the data.
// It should have a delta function for compression


(function(){
	GTA.namespace("GTA.game");
	//constructor

	GTA.game.Game = function() {
		this.levelState = new GTA.model.LevelState();
		this.lastTime= -1;
		this.render = false;
		return this;
	};

	GTA.game.Game.prototype.start = function()
	{
		var ptr = this; 
		setInterval(function() {ptr.update()},1000/30);
	}
	GTA.game.Game.prototype.update = function()
	{

		var deltaTime = (Date.now()-this.lastTime) /1000;
		for(var i in this.levelState.players)
		{
			this.levelState.players[i].update(deltaTime);
		}

		if(this.render)
		{
			
			this.render.update();
		}

		this.lastTime= Date.now();
	}

	GTA.game.Game.prototype.addPlayer = function(client)
	{
		var player = new GTA.model.PlayerState(client);
		player.id = client.id;
		this.levelState.players.push(player);
		return player;
	}

	GTA.game.Game.prototype.removePlayer = function(id)
	{
		for(var p in this.levelState.players)
		{
			if(this.levelState.players[p].id == id)
			{
				if(this.render)
				{
					this.render.scene.remove(this.levelState.players[p].render.mesh);
				}
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
			if(this.render)
			{
				this.render.scene.add(newPlayer.createMesh());
			}
		}
		this.levelState.fromJson(json);
	}

	GTA.game.Game.prototype.fromJson = function(json)
	{
		this.levelState.fromJson(json);
	}

	GTA.game.Game.prototype.attachRender = function(render)
	{
		this.render = render;
	}



	//Get as delta encoded string

})();