

(function(){
	GTA.namespace("GTA.model");
	//constructor
	GTA.model.PlayerState = function( client ) {

		this.position = new GTA.model.Point();
		this.position.x = 0;
		this.position.y = 0;
		this.client = client;
		this.render = false;
		this.input = 0;
		this.id = client.id;
		this.keyboard = new GTA.Input.Keyboard(); //don't start on clients


		return this;
	};

	GTA.model.PlayerState.prototype.createMesh = function()
	{

		this.render = new GTA.model.EntityRender();
		return this.render.mesh;
	}

	GTA.model.PlayerState.prototype.setInput = function(bitmask)
	{

		this.keyboard.deconstructInputBitmask(bitmask);
	}

	GTA.model.PlayerState.prototype.update = function(deltatime)
	{

		if(this.render)
		{

			this.render.mesh.position.x = this.position.x;
			this.render.mesh.position.y = this.position.y;

		}
		else
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
	}

	GTA.model.PlayerState.prototype.toJson = function()
	{
		///Fuck floating point precisions. 
		var precision = 2;
		var x = Math.round(this.position.x*Math.pow(10,precision));
		
		var y = (Math.round(this.position.y*Math.pow(10,precision)));
		return {id:this.id,position:{x:x,y:y}};
	}

	GTA.model.PlayerState.prototype.fromJson = function(json)
	{
		///Fuck floating point precisions. 
		var precision = 2;
		var x = json.position.x/Math.pow(10,precision);
		var y = json.position.y/Math.pow(10,precision);

		this.position.x = x;
		this.position.y = y;
	}

	GTA.model.PlayerState.prototype.destroy = function()
	{
		if(this.render)
		{
			this.render.destroy();
			this.render = false;
			
		}
	}

	//Get as delta compressed string

})();