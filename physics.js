var physicsWorld;

var car;

var engine_speed = 0;
var steering_angle = 0;
var steer_speed = 1.0;
var max_steer_angle = Math.PI/3.0;	//60 degrees to be precise

var carDimX = 0.4;
var carDimY = 0.7;

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
         

//The car object
var car = {
	
	'top_engine_speed' : 50.0 ,
	'engine_on' : false ,
	
	'start_engine' : function()
	{
		car.engine_on = true;
		car.engine_speed = car.gear * car.top_engine_speed;
	} ,
	
	'stop_engine' : function()
	{
		car.engine_on = false;
		car.engine_speed = 0;
	} ,
	
	'gear' : 1
};


   
function initPhysics(){


	
	
       world = new b2World(
             new b2Vec2(0, 0)    //gravity
          ,  true                 //allow sleep
       );
         
       var fixDef = new b2FixtureDef;
       fixDef.density = 1.0;
       fixDef.friction = 0.5;
       fixDef.restitution = 0.2;
         
       var bodyDef = new b2BodyDef;
      /*   
       //create ground
       bodyDef.type = b2Body.b2_staticBody;
       bodyDef.position.x = 85 * tileSize;;
       bodyDef.position.y = -190 * tileSize;;
       fixDef.shape = new b2PolygonShape;
       fixDef.shape.SetAsBox(10, 0.5);
       world.CreateBody(bodyDef).CreateFixture(fixDef);
	   */
       
         
   	create_car();
	
	
	geometry = new THREE.CubeGeometry( tileSize*carDimX, tileSize*carDimY, tileSize*0.1 );
	material = new THREE.MeshBasicMaterial( { color: 0xffff00, wireframe: false } );

	
	car.mesh = new THREE.Mesh( geometry, material );
	car.mesh.position.z = tileSize*2;
	
	scene.add( car.mesh );
		
	/*
	bodyDef = new b2BodyDef;
    bodyDef.type = b2Body.b2_dynamicBody;
      
    fixDef.shape = new b2PolygonShape;
    fixDef.shape.SetAsBox( tileSize, tileSize);
      
    bodyDef.position.x = 85 * tileSize;
    bodyDef.position.y = -190 * tileSize;

    car.body =  world.CreateBody(bodyDef);
	car.body.CreateFixture(fixDef);
    */
	
	createPhysicsScene();
	
	document.addEventListener( 'keydown', onDocumentKeyDown, false );
	document.addEventListener( 'keyup', onDocumentKeyUp, false );
	

}

function onDocumentKeyDown( event ){
	var code = event.keyCode;
		
			//left
			if(code == 37)
			{
				steering_angle = max_steer_angle;
				steer_speed = 0.3;
			}
			//up
			if(code == 38)
			{
				car.gear = 1;
				car.start_engine();
			}
		
			//right
			if(code == 39)
			{
				steering_angle = -1 * max_steer_angle;
				steer_speed = 0.3;
			}
		
			//down
			if(code == 40)
			{
				car.gear = -1;
				car.start_engine();
			}
	
}

function onDocumentKeyUp( event ){
	var code = event.keyCode;
		
			//stop forward velocity only when up or down key is released
			if(code == 38 || code == 40)
			{
				car.stop_engine();
			}
			//LEFT OR RIGHT
			if(code == 37 || code == 39)
			{
				steering_angle = 0.0;
				//This is called POWER STEERING, when the steering is released the front wheels need to become straight very quickly
				steer_speed = 80.0;
			}
//	
}

function createPhysicsScene()
{	

	
       var fixDef = new b2FixtureDef;
       fixDef.density = 1.0;
       fixDef.friction = 0.5;
       fixDef.restitution = 0.2;
	
	
	
	console.log("Create Phyics Scene");
    for (var i = drawLevelArea[1]; i < drawLevelArea[3]; i++)
	{	
        for (var j = drawLevelArea[0]; j < drawLevelArea[2]; j++)
		{		
			
			var create = false;
			var category = 0;
			
			//Iterate all blocks in z coordinate and update box2d category
			for (var k = 2; k < 8; k++)
			{
				var block = level.map[i][j][k];
				
				if(block != undefined && !create)
				{ 
					if(block.Left != undefined && block.Left.wall != 0)
					{
						create = true;
					}
					if(block.Right != undefined && block.Right.wall != 0)
					{
						create = true;					
					}	
					if(block.Top != undefined && block.Top.wall != 0)
					{
						create = true;				
					}
					if(block.Bottom != undefined && block.Bottom.wall != 0)
					{
						create = true;										
					}		
				}
				
				if(create){
					category += 1<<k;
				}
			}
			
			if(create){
		        var bodyDef = new b2BodyDef;
					
		        bodyDef.type = b2Body.b2_staticBody;
		        bodyDef.position.x = i * tileSize/10.0;
		        bodyDef.position.y = (-j * tileSize/10.0);

		        fixDef.shape = new b2PolygonShape;
		        fixDef.shape.SetAsBox(tileSize/10.0, tileSize/10.0);
				fixDef.filter.categoryBits = category;
					
		        world.CreateBody(bodyDef).CreateFixture(fixDef);


				//Debug polygon
				/*
				geometry = new THREE.CubeGeometry( tileSize, tileSize, tileSize );
				material = new THREE.MeshBasicMaterial( {transparent:true, color: 0x00ffFF, wireframe: true } );

	
				mesh = new THREE.Mesh( geometry, material );
				mesh.position.z = tileSize*2;
	
				mesh.position.x = i * tileSize ;
				mesh.position.y = (-j * tileSize);
				scene.add( mesh );
				*/
			}
		}
	}
}


var physicsUpdate = function(){

	update_car();
    
	world.Step(
          1 / 60   //frame-rate
       ,  10       //velocity iterations
       ,  10       //position iterations
    );

    world.ClearForces();
	
}



//Create standard boxes of given height , width at x,y
function createBox(world, x, y, width, height, options) 
{
	 //default setting
	options = $.extend(true, {
		'density' : 0.3 ,
		'friction' : 0.0 ,
		'restitution' : 0.2 ,
		
		'linearDamping' : 0.0 ,
		'angularDamping' : 0.0 ,
		
		'gravityScale' : 1.0 ,
		'type' : b2Body.b2_dynamicBody
	}, options);
	
	var body_def = new b2BodyDef();
	var fix_def = new b2FixtureDef;
	
	fix_def.density = options.density;
	fix_def.friction = options.friction;
	fix_def.restitution = options.restitution;
	
	fix_def.shape = new b2PolygonShape();
	
	fix_def.shape.SetAsBox( width , height );
	
	fix_def.filter.maskBits = 1<<2; //Change this for other z levels
	
	body_def.position.Set(x , y);
	
	body_def.linearDamping = options.linearDamping;
	body_def.angularDamping = options.angularDamping;
	
	body_def.type = options.type;
	
	var b = world.CreateBody( body_def );
	var f = b.CreateFixture(fix_def);
	
	return b;
}


function create_car()
{
	car_pos = new b2Vec2(85*tileSize/10.0 ,-195*tileSize/10.0);
	car_dim = new b2Vec2(carDimX , carDimY);
	car.body = createBox(world , car_pos.x , car_pos.y , car_dim.x , car_dim.y , {'linearDamping' : 10.0 , 'angularDamping' : 10.0});
	
	var wheel_dim = car_dim.Copy();
	wheel_dim.Multiply(0.2);
	
	//front wheels
	left_wheel = createBox(world , car_pos.x - car_dim.x , car_pos.y + car_dim.y / 2 , wheel_dim.x , wheel_dim.y , {});
	right_wheel = createBox(world , car_pos.x + car_dim.x, car_pos.y + car_dim.y / 2 , wheel_dim.x , wheel_dim.y , {});
	
	//rear wheels
	left_rear_wheel = createBox(world , car_pos.x - car_dim.x , car_pos.y - car_dim.y / 2 , wheel_dim.x , wheel_dim.y , {});
	right_rear_wheel = createBox(world , car_pos.x + car_dim.x, car_pos.y - car_dim.y / 2 , wheel_dim.x , wheel_dim.y , {});
	
	var front_wheels = {'left_wheel' : left_wheel , 'right_wheel' : right_wheel};
	
	for (var i in front_wheels)
	{
		var wheel = front_wheels[i];
		
		var joint_def = new b2RevoluteJointDef();
		joint_def.Initialize(car.body , wheel, wheel.GetWorldCenter());
		
		//after enablemotor , setmotorspeed is used to make the joins rotate , remember!
		joint_def.enableMotor = true;
		joint_def.maxMotorTorque = 100000;
		
		//this will prevent spinning of wheels when hit by something strong
		joint_def.enableLimit = true;
  		joint_def.lowerAngle =  -1 * max_steer_angle;
		joint_def.upperAngle =  max_steer_angle;
		
		//create and save the joint
		car[i + '_joint'] = world.CreateJoint(joint_def);
	}
	
	var rear_wheels = {'left_rear_wheel' : left_rear_wheel , 'right_rear_wheel' : right_rear_wheel};
	
	for (var i in rear_wheels)
	{
		var wheel = rear_wheels[i];
		
		var joint_def = new b2PrismaticJointDef();
		joint_def.Initialize( car.body , wheel, wheel.GetWorldCenter(), new b2Vec2(1,0) );
	
		joint_def.enableLimit = true;
		joint_def.lowerTranslation = joint_def.upperTranslation = 0.0;
		
		car[i + '_joint'] = world.CreateJoint(joint_def);
	}
	
	car.left_wheel = left_wheel;
	car.right_wheel = right_wheel;
	car.left_rear_wheel = left_rear_wheel;
	car.right_rear_wheel = right_rear_wheel;
	
	return car;
}

//Method to update the car
function update_car()
{
	var wheels = ['left' , 'right'];
	
	//Driving
	for(var i in wheels)
	{
		var d = wheels[i] + '_wheel';
		var wheel = car[d];
		
		//get the direction in which the wheel is pointing
		var direction = wheel.GetTransform().R.col2.Copy();
		//console.log(direction.y);
		direction.Multiply( car.engine_speed );
		
		//apply force in that direction
		wheel.ApplyForce( direction , wheel.GetPosition() );
	}	
	
	//Steering
	for(var i in wheels)
	{
		var d = wheels[i] + '_wheel_joint';
		var wheel_joint = car[d];
		
		//max speed - current speed , should be the motor speed , so when max speed reached , speed = 0;
		var angle_diff = steering_angle - wheel_joint.GetJointAngle();
		wheel_joint.SetMotorSpeed(angle_diff * steer_speed);
	}
	
	
	//Mesh 
	car.mesh.position.x = car.body.GetPosition().x*10.0;
	car.mesh.position.y = car.body.GetPosition().y*10.0;
	car.mesh.rotation.z = car.body.GetAngle() ;
	
}