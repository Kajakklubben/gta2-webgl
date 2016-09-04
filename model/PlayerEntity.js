//

if(typeof Box2D == 'undefined'){ 
	//Node.js implementation
	var Box2D = require("../libs/box2d/Box2DServer.js").Box2D;
}


(function() {
	//Get the objects of Box2d Library
	var b2Vec2 = Box2D.Common.Math.b2Vec2
		,  	b2AABB = Box2D.Collision.b2AABB
		,	b2BodyDef = Box2D.Dynamics.b2BodyDef
		,	b2Body = Box2D.Dynamics.b2Body
		,	b2FixtureDef = Box2D.Dynamics.b2FixtureDef
		,	b2Fixture = Box2D.Dynamics.b2Fixture
		,	b2World = Box2D.Dynamics.b2World
		,	b2PolygonShape = Box2D.Collision.Shapes.b2PolygonShape
		,	b2CircleShape = Box2D.Collision.Shapes.b2CircleShape
		,	b2DebugDraw = Box2D.Dynamics.b2DebugDraw
		,  	b2MouseJointDef =  Box2D.Dynamics.Joints.b2MouseJointDef
		,  	b2Shape = Box2D.Collision.Shapes.b2Shape
		,	b2RevoluteJointDef = Box2D.Dynamics.Joints.b2RevoluteJointDef
		,	b2Joint = Box2D.Dynamics.Joints.b2Joint
		,	b2PrismaticJointDef = Box2D.Dynamics.Joints.b2PrismaticJointDef
		;
         
		 
		 
	
	GTA.namespace("GTA.Model");
	//constructor
	GTA.Model.PlayerEntity = function(client, collisionMap, keyboard) {

		this.position = new GTA.Model.Point();
		this.position.x = 85 * 64;
		this.position.y = -190 * 64;
		this.position.z = 0;
		
		this.initialPosition = this.position;
		
		this.velocity = new GTA.Model.Point();

		this.rotation = 0.0;
		this.client = client;
		this.input = 0;
		this.id = client.id;
		this.keyboard = keyboard;
		if(!this.keyboard) {
			this.keyboard = new GTA.Input.Keyboard()			
		}
		
		keyboardinplayer = this.keyboard;

		this.collisionMap = collisionMap;

		this.collisionWorld = this.collisionMap.world;
		
		
		var body_def = new b2BodyDef();
		var fix_def = new b2FixtureDef;
	
		fix_def.density = 1.3;
		fix_def.friction = 0.0;
		fix_def.restitution = 0.0;
	
		fix_def.shape = new b2CircleShape(1);
	
//		fix_def.shape.SetAsBox(2 , 2);
	
		fix_def.filter.maskBits = 1<<4; //Change this for other z levels
	
		body_def.position.Set(this.position.x/10 , -this.position.y/10);
	
		body_def.linearDamping = 0.0;
		body_def.angularDamping = 0;
		body_def.allowSleep = false;
		
		body_def.type = b2Body.b2_dynamicBody;
		
		
		this.body = this.collisionWorld.CreateBody( body_def );
		this.fixture = this.body.CreateFixture(fix_def);
				
		return this;
	};

	GTA.Model.PlayerEntity.prototype.setInput = function(bitmask) {

		this.keyboard.deconstructInputBitmask(bitmask);
	}

	GTA.Model.PlayerEntity.prototype.update = function(deltatime) {
		
		if(typeof window !== "undefined" && !this.isLocal)
			return;
		
		var velocity = new GTA.Model.Point(0,0,0);

		if (this.keyboard.isUp()) {
			velocity = new GTA.Model.Point(0,  GTA.Constants.PLAYER.MOVESPEED,0);
			if(this.keyboard.isShift()){
				velocity = new GTA.Model.Point(0,  GTA.Constants.PLAYER.MOVESPEED*3,0);
				
			}
			velocity.rotate(this.rotation);
		}
		if (this.keyboard.isDown()) {
			velocity = new GTA.Model.Point(0, - GTA.Constants.PLAYER.MOVESPEED,0);
			velocity.rotate(this.rotation);
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

		var floor = this.collisionMap.FindFloorBelow(this.position);
		if(this.position.z < floor+1){
			this.position.z = floor+1;
		} else if(this.position.z > floor+1){
			this.position.z -= 0.05;
		}
		
		this.body.SetFixedRotation(this.rotation);
		this.body.SetPosition(new b2Vec2(this.position.x/10, -this.position.y/10));
		
		filter = this.fixture.GetFilterData();
		filter.maskBits = 1<<Math.ceil(floor+1);
		this.fixture.SetFilterData(filter);
		
		speed = new b2Vec2(velocity.x/10, -velocity.y/10);
		this.body.SetLinearVelocity(speed);
		this.velocity = velocity;

	}
	
	GTA.Model.PlayerEntity.prototype.afterBodyUpdate = function(deltatime) {
		if(typeof window !== "undefined" && !this.isLocal)
			return;

		this.position.x = this.body.GetPosition().x*10;
		this.position.y = -this.body.GetPosition().y*10;
	};
	
	

	GTA.Model.PlayerEntity.prototype.toJson = function() {
		///Fuck floating point precisions. 
		var precision = 2;
		
		
		var rotation = (Math.round(this.rotation * Math.pow(10, precision)));
		return {
			id: this.id,
			position: {
				x: Math.round(this.position.x * Math.pow(10, precision)),
				y: Math.round(this.position.y * Math.pow(10, precision)),
				z: Math.round(this.position.z * Math.pow(10, precision))
			},
			velocity: {
				x: Math.round(this.velocity.x * Math.pow(10, precision)),
				y: Math.round(this.velocity.y * Math.pow(10, precision)),
				z: Math.round(this.velocity.z * Math.pow(10, precision))
			},
			rotation: rotation
			
		};
	}

	GTA.Model.PlayerEntity.prototype.fromJson = function(json) {
		///Fuck floating point precisions. 
		var precision = 2;

		var rotation = json.rotation / Math.pow(10, precision);

		this.position.x = json.position.x / Math.pow(10, precision);
		this.position.y = json.position.y / Math.pow(10, precision);
		this.position.z = json.position.z / Math.pow(10, precision);

		this.velocity.x = json.velocity.x / Math.pow(10, precision);
		this.velocity.y = json.velocity.y / Math.pow(10, precision);
		this.velocity.z = json.velocity.z / Math.pow(10, precision);
		
		this.rotation = rotation;
				
	}

	GTA.Model.PlayerEntity.prototype.destroy = function() {
		if (this.render) {
			this.render.destroy();
			this.render = false;

		}
	}


	GTA.Model.PlayerEntity.prototype.revert = function(inputStates) {
	}

	//Get as delta compressed string

})();

var keyboardinplayer;
