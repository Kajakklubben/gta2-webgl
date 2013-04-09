//
// Gets initiliazed by Core.MapLoader
//

if(typeof Box2D == 'undefined'){ 
	//Node.js implementation
	var Box2D = require("../libs/box2d/Box2DServer.js").Box2D;
}


(function(){
	//Get the objects of Box2d Library
	var b2Vec2 = Box2D.Common.Math.b2Vec2
	,  	b2Transform = Box2D.Common.Math.b2Transform
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
	
	GTA.namespace("GTA.Core");
	
	//
	//constructor
	//
	GTA.Core.CollisionMap = function() {

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
	GTA.Core.CollisionMap.prototype.FindPathCollision = function(position, path){
		z = Math.round(position.z);
		
		srcX = Math.round(position.x/64);
		srcY = Math.round(-position.y/64);
		
		dstX = Math.round((position.x+path.x)/64);
		dstY = Math.round(-(position.y+path.y)/64);
		
		testBlocks = new Array();
		testPositions = new Array();
		
		srcBlock = this.collisionData[srcX][srcY][z];		
		
		//Diagonal raycast (on src tile)
		if(srcBlock != undefined){
			for(i=0; i<srcBlock.length; i++){
				if(srcBlock[i].diagonal != undefined){
					testPositions.push(new b2Vec2(srcX*64,srcY*64))
					testBlocks.push(srcBlock[i]);
				}
			} 
		}
		

		//Add all neighbor tiles
		block = this.collisionData[srcX+1][srcY][z];
		for(i=0; i< block.length; i++){
			testPositions.push(new b2Vec2((srcX+1)*64,(srcY)*64))
			testBlocks.push(block[i]);
		}
		
		block = this.collisionData[srcX-1][srcY][z];
		for(i=0; i< block.length; i++){
			testPositions.push(new b2Vec2((srcX-1)*64,(srcY)*64))
			testBlocks.push(block[i]);
		}
		
		block = this.collisionData[srcX][srcY+1][z];
		for(i=0; i< block.length; i++){
			testPositions.push(new b2Vec2((srcX)*64,(srcY+1)*64))
			testBlocks.push(block[i]);
		}
		
		block = this.collisionData[srcX][srcY-1][z];
		for(i=0; i< block.length; i++){
			testPositions.push(new b2Vec2((srcX)*64,(srcY-1)*64))
			testBlocks.push(block[i]);
		}
		
		
		//raycast on dst tile
		if(srcX != dstX || srcY != dstY){
			// srcBlock = this.collisionData[srcX][srcY][z];
			dstBlock = this.collisionData[dstX][dstY][z];
			
			for(i=0; i< dstBlock.length; i++){
				testPositions.push(new b2Vec2(dstX*64,dstY*64))
				testBlocks.push(dstBlock[i]);
			}
		}
		
		if(srcX != dstX && srcY != dstY){
			dstBlock1 = this.collisionData[dstX][srcY][z];
			dstBlock2 = this.collisionData[srcX][dstY][z];
			
			for(i=0; i< dstBlock1.length; i++){
				testPositions.push(new b2Vec2(dstX*64,srcY*64))
				testBlocks.push(dstBlock1[i]);
			}
			for(i=0; i< dstBlock2.length; i++){
				testPositions.push(new b2Vec2(srcX*64,dstY*64))
				testBlocks.push(dstBlock2[i]);
			}
		}
		
		
		//Test blocks for collision
		relativePosition = position.clone();
		relativePosition.translatePoint(path);
		relativePosition.y *= -1;
		
		
		for( i=0 ; i<testBlocks.length ; i++ ){
			shape = new b2CircleShape(10);

			transform1 = new b2Transform();
			transform1.position = new b2Vec2(relativePosition.x,relativePosition.y);
		
			transform2 = new b2Transform();
			transform2.position = testPositions[i];

			
			collision = b2Shape.TestOverlap(shape, transform1, testBlocks[i].GetShape(), transform2 );
			
		
			if(collision)
				return true;
		}
		
		
				
		return false;
	}
	
	
	
	//
	//Calculates the floor height for the block, or returns undefined if no floor
	//
	GTA.Core.CollisionMap.prototype.BlockFloorLevel = function(block, i, relativePosition){
		if(block != undefined){
	 	   if (block.Lid != undefined && block.Lid.tileNumber != undefined && block.Lid.tileNumber != 0) {
			   
			   	// If the block is a slope we here find the height at the position
				if(block.slopeType != undefined){

					//Slopes:
					if(block.slopeType == 8){ //Right High (Tested!)
						return i - (1-relativePosition.x)*0.5;
					} else if(block.slopeType == 7){ //Right Low 
						return i - (1-relativePosition.x)*0.5-0.5;
					} else if(block.slopeType == 6){ //Left High 
						return i - (relativePosition.x)*0.5;
					} else if(block.slopeType == 5){ //Left Low  
						return i - (relativePosition.x)*0.5-0.5;
					} else if(block.slopeType == 4){ //Down High 
						return i - (1-relativePosition.y)*0.5;
					} else if(block.slopeType == 3){ //Down Low  
						return i - (1-relativePosition.y)*0.5-0.5;
					} else if(block.slopeType == 2){ //Up High 
						return i - (relativePosition.y)*0.5;
					} else if(block.slopeType == 1){ //Up Low 
						return i - (relativePosition.y)*0.5-0.5;
					}
					
					//Diagonals
					else if(block.slopeType == 45){ //facing up left
						if( (relativePosition.x) + (relativePosition.y) >= 1){
							return i;
						} else {
							return i-1;
						}
					}
					else if(block.slopeType == 46){ //facing up right
						if( (1-relativePosition.x) + (relativePosition.y) >= 1){
							return i;
						} else {
							return i-1;
						}
					}
					else if(block.slopeType == 47){ //Facing down left
						if( (relativePosition.x) + (1-relativePosition.y) >= 1){
							return i;
						} else {
							return i-1;
						}
					}
					else if(block.slopeType == 47){ //facing down right
						if( (relativePosition.x) + (relativePosition.y) <= 1){
							return i;
						} else {
							return i-1;
						}
					}
					
					 else {
						console.log(block.slopeType);
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
	GTA.Core.CollisionMap.prototype.FindFloorBelow = function(position){
		relativePosition = position.clone();

		relativePosition.x -= Math.round(position.x/64) * 64;
		relativePosition.x += 32;
		relativePosition.x /= 64;
		
		relativePosition.y -= Math.round(position.y/64) * 64;
		relativePosition.y *= -1;
		relativePosition.y += 32;
		relativePosition.y /= 64;
				
		for(i=Math.round(position.z); i>=0; i--){
			var block = this.level[Math.round(position.x/64)][Math.round(-position.y/64)][i];

			floorLevel = this.BlockFloorLevel(block, i,relativePosition);
			if(floorLevel != undefined)
				return floorLevel;
			
		}
		
		for(i=Math.round(position.z); i<8; i++){
			var block = this.level[Math.round(position.x/64)][Math.round(-position.y/64)][i];
			
			floorLevel = this.BlockFloorLevel(block, i,relativePosition);
			if(floorLevel != undefined)
				return floorLevel;
			
		}
		return 0;
	}
	
	
	//
	// Calculates all the collision shapes based on the raw mapData
	//
	GTA.Core.CollisionMap.prototype.InterpretMapData = function(mapData)
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
							bodyDef.position = new b2Vec2(i*64, j*64);

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
 							bodyDef.position = new b2Vec2(i*64, j*64);

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
 							bodyDef.position = new b2Vec2(i*64, j*64);

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
							bodyDef.position = new b2Vec2(i*64, j*64);
							
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
							bodyDef.position = new b2Vec2(i*64, j*64);
							 
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
	GTA.Core.CollisionMap.prototype.SetupDebugRender = function(scene)
	{
		for (var i = GTA.Constants.CLIENT_SETTING.LOAD_LEVEL_AREA[1]; i < GTA.Constants.CLIENT_SETTING.LOAD_LEVEL_AREA[3]; i++)
		{	
	        for (var j = GTA.Constants.CLIENT_SETTING.LOAD_LEVEL_AREA[0]; j < GTA.Constants.CLIENT_SETTING.LOAD_LEVEL_AREA[2]; j++)
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