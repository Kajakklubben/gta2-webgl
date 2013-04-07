if(typeof Box2D == 'undefined'){ 
	//Node.js implementation
	var Box2D = require("../box2d/Box2DServer.js").Box2D;
}


(function(){
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
	,	b2RayCastInput = Box2D.Collision.b2RayCastInput
	,	b2RayCastOutput = Box2D.Collision.b2RayCastOutput
	;
	
	GTA.namespace("GTA.core");
	
	//
	//constructor
	//
	GTA.core.CollisionMap = function() {

		// 3D Array containing b2FixtureDef array describing each tile
		this.collisionData = false;
		
		//Local storage of the map level
		this.level = false;
		
		this.world = new b2World(new b2Vec2(0,0),  true); //Not used for much other then creating fixtures
		
		return this;
	}
	
	//
	//Find any collisions on the path from the position
	//
	GTA.core.CollisionMap.prototype.FindPathCollision = function(position, path){
		z = Math.round(position.z);
		
		srcX = Math.round(position.x/64);
		srcY = Math.round(-position.y/64);
		
		dstX = Math.round((position.x+path.x)/64);
		dstY = Math.round(-(position.y+path.y)/64);
		
		srcBlock = this.collisionData[srcX][srcY][z];
		
		//Diagonal raycast (on src tile)
		for(i=0; i< srcBlock.length; i++){
			if(srcBlock[i].diagonal != undefined){
				// console.log("Check diagonal")
				relativePosition = position.clone();
				relativePosition.x -= srcX * 64;
				
				relativePosition.y *= -1;
				relativePosition.y -= srcY * 64;
				
				
			    input = new b2RayCastInput();
			        input.p1 = new b2Vec2(relativePosition.x,relativePosition.y);
			        input.p2 = new b2Vec2(relativePosition.x+path.x,relativePosition.y-path.y);
			        input.maxFraction = 1;
  
  
			   	output = new b2RayCastOutput();	
				srcBlock[i].RayCast(output, input);
				
				// console.log(output);	

				if(output.fraction != undefined){
					return output.fraction;
				}
				
			}
		}
		
		//raycast on dst tile
		if(srcX != dstX || srcY != dstY){
			// srcBlock = this.collisionData[srcX][srcY][z];
			dstBlock = this.collisionData[dstX][dstY][z];
			
			for(i=0; i< dstBlock.length; i++){
				relativePosition = position.clone();
				relativePosition.x -= dstX * 64;
				
				relativePosition.y *= -1;
				relativePosition.y -= dstY * 64;
				
				
			    input = new b2RayCastInput();
			        input.p1 = new b2Vec2(relativePosition.x,relativePosition.y);
			        input.p2 = new b2Vec2(relativePosition.x+path.x,relativePosition.y-path.y);
			        input.maxFraction = 1;
  
  
			   output = new b2RayCastOutput();	
				dstBlock[i].RayCast(output, input);
				
				// console.log(output);	

				if(output.fraction != undefined){
					return output.fraction;
				}
				
			}

		}
				
		return false;
	}
	
	//
	//Calculates the floor height for the block, or returns undefined if no floor
	//
	GTA.core.CollisionMap.prototype.BlockFloorLevel = function(block, i){
		if(block != undefined){
	 	   if (block.Lid != undefined && block.Lid.tileNumber != undefined && block.Lid.tileNumber != 0) {
			   
			   	// If the block is a slope we here find the height at the position
				if(block.slopeType != undefined){
					if(block.slopeType == 8){ //Right High (Tested!)
						return i - (1-relativePosition.x)*0.5;
					} else if(block.slopeType == 7){ //Right Low (Tested!)
						return i - (1-relativePosition.x)*0.5-0.5;
					} else if(block.slopeType == 6){ //Left High (untested)
						return i - (relativePosition.x)*0.5;
					} else if(block.slopeType == 5){ //Left Low  (untested)
						return i - (relativePosition.x)*0.5-0.5;
					} else if(block.slopeType == 4){ //Down High  (untested)
						return i - (relativePosition.y)*0.5;
					} else if(block.slopeType == 3){ //Down Low  (untested)
						return i - (relativePosition.y)*0.5-0.5;
					} else if(block.slopeType == 2){ //Up High  (untested)
						return i - (1-relativePosition.y)*0.5;
					} else if(block.slopeType == 1){ //Up Low  (untested)
						return i - (1-relativePosition.y)*0.5-0.5;
					} else {
						return i;
					}
					
				} else {
				
					return i;
				}
			}
		}
		return undefined;
	}
	
	
	
	//
	//Finds the floor that is either below the position, or if none, the nearest one above
	//
	GTA.core.CollisionMap.prototype.FindFloorBelow = function(position){
		relativePosition = position.clone();
		relativePosition.x -= Math.round(position.x/64) * 64;
		relativePosition.x += 32;
		relativePosition.x /= 64;
		
		relativePosition.y *= -1;
		relativePosition.y -= Math.round(position.y/64) * 64;
		relativePosition.y += 32;
		relativePosition.y /= 64;
				
		for(i=Math.round(position.z); i>=0; i--){
			var block = this.level[Math.round(position.x/64)][Math.round(-position.y/64)][i];

			floorLevel = this.BlockFloorLevel(block, i);
			if(floorLevel != undefined)
				return floorLevel;
			
		}
		
		for(i=Math.round(position.z); i<8; i++){
			var block = this.level[Math.round(position.x/64)][Math.round(-position.y/64)][i];
			
			floorLevel = this.BlockFloorLevel(block, i);
			if(floorLevel != undefined)
				return floorLevel;
			
		}
		return 0;
	}
	
	
	//
	// Calculates all the collision shapes based on the raw mapData
	//
	GTA.core.CollisionMap.prototype.InterpretMapData = function(mapData)
	{
		this.level = mapData;
		
		iArray = new Array();

		for (var i = 0; i < 256; i++)
		{	
			
			jArray = new Array();
	       	for (var j = 0; j < 256; j++)
			{	

				kArray = new Array();
				for (var k = 0; k < 8; k++)
				{
					
					kArray[k] = new Array();

					var block = mapData[i][j][k];
					
					if(block != undefined)
					{ 	
						
						//Diagonals
						if(block.slopeType >= 45 && block.slopeType <= 48){
							if(block.slopeType == 45 || block.slopeType == 48){
								p1 = new b2Vec2(-32, 32);
								p2 = new b2Vec2(32, -32);
							}
							if(block.slopeType == 46 || block.slopeType == 47 ){
								p1 = new b2Vec2(-32, -32);
								p2 = new b2Vec2(32, 32);
							}

							
	   						var fixDef = new b2FixtureDef;
							fixDef.shape = new b2PolygonShape;
		        			fixDef.shape.SetAsEdge(p1,p2);

							var bodyDef = new b2BodyDef;
							 bodyDef.type = b2Body.b2_staticBody;
							fixture = this.world.CreateBody(bodyDef).CreateFixture(fixDef);
							fixture.diagonal = true;
							
		        			kArray[k].push(fixture);
						}

						//Sides
						if(block.Left != undefined && block.Left.wall != 0)
						{
							p1 = new b2Vec2(-32, -32);
							p2 = new b2Vec2(-32, 32);

	   						var fixDef = new b2FixtureDef;
							fixDef.shape = new b2PolygonShape;
		        			fixDef.shape.SetAsEdge(p1,p2);

							var bodyDef = new b2BodyDef;
							 bodyDef.type = b2Body.b2_staticBody;
							fixture = this.world.CreateBody(bodyDef).CreateFixture(fixDef);
							
		        			kArray[k].push(fixture);
						}
						
						if(block.Right != undefined && block.Right.wall != 0)
						{
							p1 = new b2Vec2(32, -32);
							p2 = new b2Vec2(32, 32);

	   						var fixDef = new b2FixtureDef;
							fixDef.shape = new b2PolygonShape;
		        			fixDef.shape.SetAsEdge(p1,p2);

							var bodyDef = new b2BodyDef;
							 bodyDef.type = b2Body.b2_staticBody;
							fixture = this.world.CreateBody(bodyDef).CreateFixture(fixDef);
							
		        			kArray[k].push(fixture);
						}	
						if(block.Top != undefined && block.Top.wall != 0)
						{
							p1 = new b2Vec2(-32, -32);
							p2 = new b2Vec2(32, -32);

	   						var fixDef = new b2FixtureDef;
							fixDef.shape = new b2PolygonShape;
		        			fixDef.shape.SetAsEdge(p1,p2);

							var bodyDef = new b2BodyDef;
							 bodyDef.type = b2Body.b2_staticBody;
							fixture = this.world.CreateBody(bodyDef).CreateFixture(fixDef);
							
		        			kArray[k].push(fixture);
						}
						if(block.Bottom != undefined && block.Bottom.wall != 0)
						{
							p1 = new b2Vec2(-32, 32);
							p2 = new b2Vec2(32, 32);

	   						var fixDef = new b2FixtureDef;
							fixDef.shape = new b2PolygonShape;
		        			fixDef.shape.SetAsEdge(p1,p2);

							var bodyDef = new b2BodyDef;
							 bodyDef.type = b2Body.b2_staticBody;
							fixture = this.world.CreateBody(bodyDef).CreateFixture(fixDef);
							
		        			kArray[k].push(fixture);
		           		}		
					}
				}
				
				jArray[j] = kArray;

			}
			iArray[i] = jArray;
		}

		this.collisionData = iArray;
	}



	//
	// Red boxes showing the collision map for debug
	//
	GTA.core.CollisionMap.prototype.SetupDebugRender = function(scene)
	{
		for (var i = drawLevelArea[1]; i < drawLevelArea[3]; i++)
		{	
	        for (var j = drawLevelArea[0]; j < drawLevelArea[2]; j++)
			{	
				for (var k = 2; k < 8; k++)
				{	
					for(var l=0 ; l<this.collisionData[i][j][k].length ; l++){
						vertices = this.collisionData[i][j][k][l].GetShape().GetVertices();
						
						var geometry = new THREE.Geometry();

						geometry.vertices.push( new THREE.Vector3( vertices[0].x*1.1,  -vertices[0].y*1.1, 32 ) );
						geometry.vertices.push( new THREE.Vector3( vertices[1].x*1.1,  -vertices[1].y*1.1, 32 ) );
						geometry.vertices.push( new THREE.Vector3( vertices[1].x*1.1,  -vertices[1].y*1.1, -32 ) );
						geometry.vertices.push( new THREE.Vector3( vertices[0].x*1.1,  -vertices[0].y*1.1, -32 ) );

						geometry.faces.push( new THREE.Face4( 0,1,2,3 ) );

						material = new THREE.MeshBasicMaterial( { color: 0xFF0000, wireframe:false, side:THREE.DoubleSide } );

						mesh = new THREE.Mesh( geometry, material );
						mesh.position.z = k*64;
						mesh.position.x = (i*64);
						mesh.position.y = (-j*64)


						scene.add(mesh);
					}
				}
			}
		}
	}
})();