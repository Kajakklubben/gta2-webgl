(function() {
	GTA.namespace("GTA.Model");
	//constructor
	GTA.Model.PlayerEntity = function(client) {

		this.position = new GTA.Model.Point();
		this.position.x = 85 * 64;
		this.position.y = -190 * 64;
		this.position.z = 0;
		
		this.velocity = new GTA.Model.Point();

		this.rotation = 0.0;
		this.client = client;
		this.input = 0;
		this.id = client.id;
		this.keyboard = new GTA.Input.Keyboard(); //don't start on clients

		this.collisionMap = false;
				
		return this;
	};

	GTA.Model.PlayerEntity.prototype.setInput = function(bitmask) {

		this.keyboard.deconstructInputBitmask(bitmask);
	}

	GTA.Model.PlayerEntity.prototype.update = function(deltatime) {
		
		dir = false;
		
		if (this.keyboard.isUp()) {
			dir = new GTA.Model.Point(0, deltatime * GTA.Constants.PLAYER.MOVESPEED,0);
			if(this.keyboard.isShift()){
				dir = new GTA.Model.Point(0, deltatime * GTA.Constants.PLAYER.MOVESPEED*3,0);
				
			}
			dir.rotate(this.rotation);
		}
		if (this.keyboard.isDown()) {
			dir = new GTA.Model.Point(0, -deltatime * GTA.Constants.PLAYER.MOVESPEED,0);
			dir.rotate(this.rotation);
		}
		if (this.keyboard.isLeft()) {
			this.rotation += GTA.Constants.PLAYER.ROTATIONSPEED;
			if(this.rotation > Math.PI * 2)
				this.rotation -= Math.PI * 2;
		}
		if (this.keyboard.isRight()) {
			this.rotation -= GTA.Constants.PLAYER.ROTATIONSPEED;
			
			if(this.rotation < 0 )
				this.rotation += Math.PI * 2;
		}
		
		
		if (this.keyboard.isSpace()) {
		}			
		
		
		if(dir != false){
			collision = this.collisionMap.FindPathCollision(this.position, dir);
			if(collision == false){
				this.position.translatePoint(dir);
			} else if (collision < 1 && collision > 0.2){
				//dir.multiply(collision*0.9);
				//this.position.translatePoint(dir);
			}
		}
	
		
		var floor = this.collisionMap.FindFloorBelow(this.position);
		if(this.position.z < floor+1){
			this.position.z = floor+1;
		} else if(this.position.z > floor+1){
			this.position.z -= 0.05;
		}
		
	}

	GTA.Model.PlayerEntity.prototype.toJson = function() {
		///Fuck floating point precisions. 
		var precision = 2;
		var x = Math.round(this.position.x * Math.pow(10, precision));
		var y = (Math.round(this.position.y * Math.pow(10, precision)));
		var z = (Math.round(this.position.z * Math.pow(10, precision)));
		
		var rotation = (Math.round(this.rotation * Math.pow(10, precision)));
		return {
			id: this.id,
			position: {
				x: x,
				y: y,
				z: z
			},
			rotation: rotation
			
		};
	}

	GTA.Model.PlayerEntity.prototype.fromJson = function(json) {
		///Fuck floating point precisions. 
		var precision = 2;
		var x = json.position.x / Math.pow(10, precision);
		var y = json.position.y / Math.pow(10, precision);
		var z = json.position.z / Math.pow(10, precision);

		var rotation = json.rotation / Math.pow(10, precision);

		this.position.x = x;
		this.position.y = y;
		this.position.z = z;
		
		this.rotation = rotation;
				
	}

	GTA.Model.PlayerEntity.prototype.destroy = function() {
		if (this.render) {
			this.render.destroy();
			this.render = false;

		}
	}


	GTA.Model.PlayerEntity.prototype.fastForward = function(inputStates) {
		return;
		var oldState = this.keyboard.constructInputBitmask();
		inputStates.reverse();
		for (var i in inputStates) {
			this.keyboard.setInput(inputStates[i]);

			this.update();

		}

		this.keyboard.setInput(oldState);
	}
	GTA.Model.PlayerEntity.prototype.revert = function(inputStates) {

	}

	//Get as delta compressed string

})();
