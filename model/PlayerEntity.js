

(function(){
	GTA.namespace("GTA.model");
	//constructor
	GTA.model.PlayerEntity = function( client ) {

		this.position = new GTA.model.Point();
		this.position.x = 85*64;
		this.position.y = -190*64;

		this.rotation = new GTA.model.Point();
		this.client = client;
		this.input = 0;
		this.id = client.id;
		this.keyboard = new GTA.Input.Keyboard(); //don't start on clients


		return this;
	};

	GTA.model.PlayerEntity.prototype.setInput = function(bitmask)
	{

		this.keyboard.deconstructInputBitmask(bitmask);
	}

	GTA.model.PlayerEntity.prototype.update = function(deltatime)
	{

		
		if(this.keyboard.isUp())
		{
			this.position.y += deltatime*GTA.Constants.PLAYER.MOVESPEED;
		}
		if(this.keyboard.isDown())
		{
			this.position.y -= deltatime*GTA.Constants.PLAYER.MOVESPEED;
		}
		if(this.keyboard.isLeft())
		{
			this.position.x -= deltatime*GTA.Constants.PLAYER.MOVESPEED;
		}
		if(this.keyboard.isRight())
		{
			
			this.position.x += deltatime*GTA.Constants.PLAYER.MOVESPEED;
		}
		
	}

	GTA.model.PlayerEntity.prototype.toJson = function()
	{
		///Fuck floating point precisions. 
		var precision = 2;
		var x = Math.round(this.position.x*Math.pow(10,precision));
		
		var y = (Math.round(this.position.y*Math.pow(10,precision)));
		return {id:this.id,position:{x:x,y:y}};
	}

	GTA.model.PlayerEntity.prototype.fromJson = function(json)
	{
		///Fuck floating point precisions. 
		var precision = 2;
		var x = json.position.x/Math.pow(10,precision);
		var y = json.position.y/Math.pow(10,precision);

		this.position.x = x;
		this.position.y = y;
	}

	GTA.model.PlayerEntity.prototype.destroy = function()
	{
		if(this.render)
		{
			this.render.destroy();
			this.render = false;
			
		}
	}


	GTA.model.PlayerEntity.prototype.fastForward = function(inputStates)
	{
		return;
		var oldState = this.keyboard.constructInputBitmask();
		inputStates.reverse();
		for(var i in inputStates)
		{
			this.keyboard.setInput(inputStates[i]);

			this.update();

		}

		this.keyboard.setInput(oldState);
	}
	GTA.model.PlayerEntity.prototype.revert = function(inputStates)
	{

	}

	//Get as delta compressed string

})();