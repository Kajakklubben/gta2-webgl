if(typeof Box2D == 'undefined'){
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
	;
	GTA.namespace("GTA.core");
	//constructor
	GTA.core.CollisionMap = function(  ) {

		// 3D Array containing b2FixtureDef array describing each tile
		this.collisionData = false;
				
		return this;
	}



	GTA.core.CollisionMap.prototype.InterpretMapData = function(mapData)
	{
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
		        			kArray[k].push(fixDef);
						}

						//Sides
						if(block.Left != undefined && block.Left.wall != 0)
						{
							p1 = new b2Vec2(-32, -32);
							p2 = new b2Vec2(-32, 32);

	   						var fixDef = new b2FixtureDef;
							fixDef.shape = new b2PolygonShape;
		        			fixDef.shape.SetAsEdge(p1,p2);

		        			kArray[k].push(fixDef);
						}
						
						if(block.Right != undefined && block.Right.wall != 0)
						{
							p1 = new b2Vec2(32, -32);
							p2 = new b2Vec2(32, 32);

	   						var fixDef = new b2FixtureDef;
							fixDef.shape = new b2PolygonShape;
		        			fixDef.shape.SetAsEdge(p1,p2);

		        			kArray[k].push(fixDef);
						}	
						if(block.Top != undefined && block.Top.wall != 0)
						{
							p1 = new b2Vec2(-32, -32);
							p2 = new b2Vec2(32, -32);

	   						var fixDef = new b2FixtureDef;
							fixDef.shape = new b2PolygonShape;
		        			fixDef.shape.SetAsEdge(p1,p2);

		        			kArray[k].push(fixDef);
						}
						if(block.Bottom != undefined && block.Bottom.wall != 0)
						{
							p1 = new b2Vec2(-32, 32);
							p2 = new b2Vec2(32, 32);

	   						var fixDef = new b2FixtureDef;
							fixDef.shape = new b2PolygonShape;
		        			fixDef.shape.SetAsEdge(p1,p2);

		        			kArray[k].push(fixDef);
		           		}		
					}
				}
				
				jArray[j] = kArray;

			}
			iArray[i] = jArray;
		}

		this.collisionData = iArray;
	}

	GTA.core.CollisionMap.prototype.FindFloorBelow = function(z){
		return 5;
	}


	GTA.core.CollisionMap.prototype.SetupDebugRender = function(scene)
	{
		for (var i = drawLevelArea[1]; i < drawLevelArea[3]; i++)
		{	
	        for (var j = drawLevelArea[0]; j < drawLevelArea[2]; j++)
			{	
				for (var k = 2; k < 8; k++)
				{	
					for(var l=0 ; l<this.collisionData[i][j][k].length ; l++){
			
						vertices = this.collisionData[i][j][k][l].shape.GetVertices();
						
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