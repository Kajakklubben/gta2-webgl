var tileSize = 64;
var tileSizeH = tileSize / 2;
var tileSizeQ = tileSize / 4;
var tileSizeE = tileSize / 8;

var paritalBlockRatio = 8/3;
var tileSizePartial = tileSize / paritalBlockRatio;
var partialUvsMargin = (tileSize - tileSizePartial) / 2 / tileSize;
var partialUvsSize = tileSizePartial/tileSize;

var upSlopeTypesTriangles = [41, 1];
var downSlopeTypesTriangles = [42, 3];
var leftSlopeTypesTriangles = [43, 5];
var rightSlopeTypesTriangles = [44, 7];


(function(){
	GTA.namespace("GTA.Render");

	//constructor
	GTA.Render.MapRender = function( ) {


	    this.scene = false; // THREE.Scene;		
		this.camera = false;
		
		this.sceneObjects = false; // Array containing all the Object3D containing a whole tile (full height)
		
		this.tileCache = new Array();
		
		this.visibleSceneObjects = new Array(); //All the tiles currently drawn

		return this;		
	};
	
	
	
	
	GTA.Render.MapRender.prototype.render = function() {
		camX = Math.round(this.camera.position.x/64);
		camY = Math.round(this.camera.position.y/64);

		//TODO: This should not be hardcoded!
		camW = 20;
		camH = 14;


		for(var i=this.visibleSceneObjects.length-1 ; i>=0 ; i--){
			if(this.visibleSceneObjects[i].x < camX-camW*0.5 || this.visibleSceneObjects[i].x >= camX+camW*0.5 || this.visibleSceneObjects[i].y < camY-camH*0.5 || this.visibleSceneObjects[i].y >= camY+camH*0.5){
	//			console.log("remove "+visibleSceneObjects[i].x+ " , "+visibleSceneObjects[i].y );
				this.scene.remove(this.visibleSceneObjects[i].object3d);		
			
				this.visibleSceneObjects.splice(i,1);
	//				i--;

			}	
		}

		for(var x = camX-camW*0.5 ; x < camX+camW*0.5 ; x++){

			var sceneObjectX = this.sceneObjects[x];
			if(sceneObjectX != undefined){
				for(var y = camY-camH*0.5 ; y < camY+camH*0.5 ; y++){
					var sceneObjectY = sceneObjectX[-y];
					if(sceneObjectY != undefined){

						if(sceneObjectY.parent == undefined){
							visibleSceneObject = new Object();
							visibleSceneObject.object3d = sceneObjectY;
							visibleSceneObject.x = x;
							visibleSceneObject.y = y;

							this.scene.add(visibleSceneObject.object3d);
						//	console.log("add "+x+ " , "+y);

							this.visibleSceneObjects.push(visibleSceneObject);
						}
					}
				}
			}
		}
	}
	
	
	
	GTA.Render.MapRender.prototype.CreateMesh = function(mapData, styleData){
		//Create alle the THREE 3D objects but don't add them to the scene yet. They get added in the render loop dynamicly

		iArray = new Array();
	    for (var i = GTA.Constants.CLIENT_SETTING.LOAD_LEVEL_AREA[1]; i < GTA.Constants.CLIENT_SETTING.LOAD_LEVEL_AREA[3]; i++) {

			jArray = new Array();
		    for (var j = GTA.Constants.CLIENT_SETTING.LOAD_LEVEL_AREA[0]; j < GTA.Constants.CLIENT_SETTING.LOAD_LEVEL_AREA[2]; j++) {

				tileObject = new THREE.Object3D();
				for (var k = 0; k < 8; k++) {
	                var block = mapData.map[i][j][k];
	                if (block != undefined) {
						tileObject.add(this.CreateBlock(i, j, k, block));
	                }
	            }
				jArray[j] = tileObject;
	        }
			iArray[i] = jArray;
	    }
		this.sceneObjects = iArray;
	}	
	

	GTA.Render.MapRender.prototype.CreateBlock = function(x, y, z, block) {
		blockObject = new THREE.Object3D();

	    if (block.Left != undefined && block.Left.tileNumber != 0) {
			blockPolygon = this.CreatePolygon(x, y, z, block.Left, FaceType.Left, block);
			if(blockPolygon != false){
	        	blockObject.add(blockPolygon);
			}
	    }

	    if (block.Right != undefined && block.Right.tileNumber != 0) {
			blockPolygon = this.CreatePolygon(x, y, z, block.Right, FaceType.Right, block);
			if(blockPolygon != false){
	        	blockObject.add(blockPolygon);
			}
	    }

	    if (block.Top != undefined && block.Top.tileNumber != 0) {
			blockPolygon = this.CreatePolygon(x, y, z, block.Top, FaceType.Top, block);
			if(blockPolygon != false){	        
				blockObject.add(blockPolygon);
			}	
		}

	    if (block.Bottom != undefined && block.Bottom.tileNumber != 0) {
			blockPolygon = this.CreatePolygon(x, y, z, block.Bottom, FaceType.Bottom, block);
			if(blockPolygon != false){	       
				 blockObject.add(blockPolygon);
			}	
		}

	    if (block.Lid != undefined && block.Lid.tileNumber != 0) {
			blockPolygon = this.CreatePolygon(x, y, z, block.Lid, FaceType.Lid, block);
			if(blockPolygon != false){	        
				blockObject.add(blockPolygon);
			}	
		}
		return blockObject;
	}


	GTA.Render.MapRender.prototype.CreatePolygon = function(x, y, z, face, type, block) {
	    var material;
	    if (face.tileNumber == undefined) {
			
	         return false;
	         material = new THREE.MeshBasicMaterial({ color: 0xFF00FF });
	    }
	    else {
	        material = this.getTile(face.tileNumber);
	    }


	    var geometry;

	    if (type == FaceType.Lid) 
		{
	        geometry = this.CreateLid(new THREE.Vector2(tileSizeH, -tileSizeH), block.slopeType);
	    }
	    else if (block.slopeType == SlopeType.DiagonalFacingDownRight && (type == FaceType.Bottom || type == FaceType.Right)) { // down right
	        geometry = this.CreateEdge(new THREE.Vector2(tileSizeH, tileSizeH), new THREE.Vector2(-tileSize, -tileSize));
	    }
	    else if (block.slopeType == SlopeType.DiagonalFacingDownLeft && (type == FaceType.Bottom || type == FaceType.Left)) { // down left
	        geometry = this.CreateEdge(new THREE.Vector2(tileSizeH, -tileSizeH), new THREE.Vector2(-tileSize, tileSize));
	    }
	    else if (block.slopeType == SlopeType.DiagonalFacingUpRight && (type == FaceType.Top || type == FaceType.Right)) {  // up right
	        geometry = this.CreateEdge(new THREE.Vector2(-tileSizeH, tileSizeH), new THREE.Vector2(tileSize, -tileSize));
	    }
	    else if (block.slopeType == SlopeType.DiagonalFacingUpLeft && (type == FaceType.Top || type == FaceType.Left)) {  // up left
	        geometry = this.CreateEdge(new THREE.Vector2(-tileSizeH, -tileSizeH), new THREE.Vector2(tileSize, tileSize));
	    }
	    else if (type == FaceType.Top) {
	        geometry = this.CreateEdge(new THREE.Vector2(-tileSizeH, tileSizeH), new THREE.Vector2(tileSize, 0), block.slopeType, type);
	    }
	    else if (type == FaceType.Bottom) {
	        geometry = this.CreateEdge(new THREE.Vector2(tileSizeH, -tileSizeH), new THREE.Vector2(-tileSize, 0), block.slopeType, type);
	    }
	    else if (type == FaceType.Left) {
	        geometry = this.CreateEdge(new THREE.Vector2(-tileSizeH, -tileSizeH), new THREE.Vector2(0, tileSize), block.slopeType, type);
	    }
	    else if (type == FaceType.Right) {
	        geometry = this.CreateEdge(new THREE.Vector2(tileSizeH, tileSizeH), new THREE.Vector2(0, -tileSize), block.slopeType, type);
	    }

	    var materialList = [material];
	    if (GTA.Constants.CLIENT_SETTING.SHOW_WIREFRAME) {
	        wireMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, wireframe: true, transparent: true });
	        materialList.push(wireMaterial);
	    }

	    var edge = new THREE.SceneUtils.createMultiMaterialObject(geometry, materialList);

	    var x = x * tileSize;
	    var y = y * tileSize;
	    var z = z * tileSize;

	    if (type == FaceType.Lid && (block.slopeType <= 48 && block.slopeType >= 45)) {

	        if (block.slopeType == 48) { // Bottom Right
	        }
	        else if (block.slopeType == 47) {  // Bottom Left
	            this.RotateUV(edge.children[0].geometry, 270);
	        }
	        else if (block.slopeType == 46) { // Top Right
	            //alert("test");
	            this.RotateUV(edge.children[0].geometry, 90);
	        }
	        else if (block.slopeType == 45) {  // Top Left
	            this.RotateUV(edge.children[0].geometry, 180);
	        }
	        if (face.flip == 1)
	            this.MirrorUV(edge.children[0].geometry, "x");

	        this.RotateUV(edge.children[0].geometry, face.rotation);
	    } else {
	        if (type != FaceType.Lid) {
	            if (this.isSlopeType(block.slopeType, upSlopeTypesTriangles)) { // Up
	                if (type == FaceType.Right)
	                    this.RotateUV(edge.children[0].geometry, 180);
	                else if (type == FaceType.Left)
	                    this.RotateUV(edge.children[0].geometry, 90);
	            }
	            else if (this.isSlopeType(block.slopeType, downSlopeTypesTriangles)) { // Down
	                if (type == FaceType.Right)
	                    this.RotateUV(edge.children[0].geometry, 90);
	                else if (type == FaceType.Left)
	                    this.RotateUV(edge.children[0].geometry, 180);
	            }
	            else if (this.isSlopeType(block.slopeType, leftSlopeTypesTriangles)) { // Left
	                if (type == FaceType.Top) {
	                    //this.RotateUV(edge.children[0].geometry, -90);
	                }
	                else if (type == FaceType.Bottom)
	                    this.RotateUV(edge.children[0].geometry, 90);
	            }
	            else if (this.isSlopeType(block.slopeType, rightSlopeTypesTriangles)) {  // Right
	                if (type == FaceType.Top)
	                    this.RotateUV(edge.children[0].geometry, 90);
	                else if (type == FaceType.Bottom)
	                    this.RotateUV(edge.children[0].geometry, 180);
	            }
	        }


	        this.RotateUV(edge.children[0].geometry, face.rotation);

	        if (face.flip) 
			{
				this.MirrorUV(edge.children[0].geometry, 'x');
	        }
	    }

	    edge.position.x = x;
	    edge.position.y = -y;
	    edge.position.z = z;
		
		edge.children[0].frustumCulled = false; //Slows down some, should only be on alpha tiles! - Havørnen

	    //scene.add(edge);
		return edge;
	}
	
	GTA.Render.MapRender.prototype.getTile = function(tileNo) {
	    var cache = this.tileCache[tileNo];
	    if (cache != undefined)
	        return cache;
	    var texture = new THREE.Texture(style.tiles[tileNo]);
	    texture.needsUpdate = true;
	    var material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });

	    this.tileCache[tileNo] = material;

	    return material;
	}
	/*
	Up = v3, v4
	Down = v1, v2
	Left = v2, v3
	Right = v1, v4
	*/

	GTA.Render.MapRender.prototype.ModifyToSlope = function(v1, v2, v3, v4, sv1, sv2, slopeAmount, start) {
	    // Move completely down
	    v1.z -= tileSize - start;
	    v2.z -= tileSize - start;
	    v3.z -= tileSize - start;
	    v4.z -= tileSize - start;

	    sv1.z += slopeAmount;
	    sv2.z += slopeAmount;
	}

	GTA.Render.MapRender.prototype.CreateLid = function(start, slopeType) {
	    var geometry;
		var size = tileSize;
		var partialUvs = false;

		////Partial Blocks
		if(slopeType >= 53 && slopeType <= 61)
		{
			size = tileSizePartial;
			partialUvs = true;
	
			if(slopeType == 53)
			{
				//Left, center
				start.x = -tileSizeH + size;
				start.y = -size / 2;
			}
			else if(slopeType == 54)
			{
				//Right center
				start.y = -size / 2;
			}
			else if(slopeType == 55)
			{
				//Top center
				start.x = size / 2;
				start.y = tileSizeH - size;		
			}
			else if(slopeType == 56)
			{
				//Bottom center
				start.x = size / 2;
				start.y = -tileSizeH;
			}
			else if(slopeType == 57)
			{
				//Top, left
				start.x = -tileSizeH + size;
				start.y = tileSizeH - size;	
			}
			else if(slopeType == 58)
			{
				//Top, right
				start.y = tileSizeH - size;	
			}
			else if(slopeType == 59)
			{
				//Bottom, right
				start.y = -tileSizeH;
			}
			else if(slopeType == 60)
			{
				//Bottom, right
				start.x = -tileSizeH + size;
				start.y = -tileSizeH;
			}
			else if(slopeType == 61)
			{
				//Center
				start.x = size / 2;
				start.y = -size / 2;
			}
		}

	    var v1 = new THREE.Vector3(start.x, start.y, tileSizeH);
	    var v2 = new THREE.Vector3(start.x - size, start.y, tileSizeH);
	    var v3 = new THREE.Vector3(start.x - size, start.y + size, tileSizeH);
	    var v4 = new THREE.Vector3(start.x, start.y + size, tileSizeH);

	    // Whole slopes
	    if (slopeType == 41) { // Down
	        this.ModifyToSlope(v1, v2, v3, v4, v3, v4, tileSize, 0);
	    }
	    else if (slopeType == 42) { // Up
	        this.ModifyToSlope(v1, v2, v3, v4, v1, v2, tileSize, 0);
	    }
	    else if (slopeType == 43) { // Left
	        this.ModifyToSlope(v1, v2, v3, v4, v2, v3, tileSize, 0);
	    }
	    else if (slopeType == 44) { // Right
	        this.ModifyToSlope(v1, v2, v3, v4, v1, v4, tileSize, 0);
	    }

	    // Half degree slopes
	    if (slopeType == 1) // Up
	    {
	        this.ModifyToSlope(v1, v2, v3, v4, v3, v4, tileSizeH, 0);
	    }
	    else if (slopeType == 2) {
	        this.ModifyToSlope(v1, v2, v3, v4, v3, v4, tileSizeH, tileSizeH);
	    }
	    else if (slopeType == 3) // Down
	    {
	        this.ModifyToSlope(v1, v2, v3, v4, v1, v2, tileSizeH, 0);
	    }
	    else if (slopeType == 4) {
	        this.ModifyToSlope(v1, v2, v3, v4, v1, v2, tileSizeH, tileSizeH);
	    }
	    else if (slopeType == 5)  // Left low
	    {
	        this.ModifyToSlope(v1, v2, v3, v4, v2, v3, tileSizeH, 0);
	    }
	    else if (slopeType == 6)  // Left high
	    {
	        this.ModifyToSlope(v1, v2, v3, v4, v2, v3, tileSizeH, tileSizeH);
	    }
	    else if (slopeType == 7)  // Right low
	    {
	        this.ModifyToSlope(v1, v2, v3, v4, v1, v4, tileSizeH, 0);
	    }
	    else if (slopeType == 8)   // Right high
	    {
	        this.ModifyToSlope(v1, v2, v3, v4, v1, v4, tileSizeH, tileSizeH);
	    }

	    // Eight slopes
	    else if (slopeType >= 9 && slopeType <= 16) { // Up
	        var offset = slopeType - 9;
	        this.ModifyToSlope(v1, v2, v3, v4, v3, v4, tileSizeE, tileSizeE * offset);
	    }
	    else if (slopeType >= 17 && slopeType <= 24) {  // Down
	        var offset = slopeType - 17;
	        this.ModifyToSlope(v1, v2, v3, v4, v1, v2, tileSizeE, tileSizeE * offset);
	    }
	    else if (slopeType >= 25 && slopeType <= 32) { // Left
	        var offset = slopeType - 25;
	        this.ModifyToSlope(v1, v2, v3, v4, v2, v3, tileSizeE, tileSizeE * offset);
	    }
	    else if (slopeType >= 33 && slopeType <= 40) { // Right
	        var offset = slopeType - 33;
	        this.ModifyToSlope(v1, v2, v3, v4, v1, v4, tileSizeE, tileSizeE * offset);
	    }

	    // Diagonals
	    if (slopeType == 48) { // Bottom Right
	        geometry = this.CreateFace(v1, v2, v3, v4, new THREE.Face3(3, 2, 1));
	    }
	    else if (slopeType == 47) {  // Bottom Left
	        geometry = this.CreateFace(v1, v2, v3, v4, new THREE.Face3(0, 3, 2));
	    }
	    else if (slopeType == 46) { // Top Right
	        geometry = this.CreateFace(v1, v2, v3, v4, new THREE.Face3(2, 1, 0));
	    }
	    else if (slopeType == 45) {  // Top Left
	        geometry = this.CreateFace(v1, v2, v3, v4, new THREE.Face3(1, 0, 3));
	    }
	    else {
	        geometry = this.CreateFace(v1, v2, v3, v4);
	    }

		//Parital uvs
		if(partialUvs)
		{		
			var uvs = geometry.faceVertexUvs[0][0];
	
			uvs[1].x = partialUvsMargin;
			uvs[2].x = partialUvsMargin;
	
			uvs[0].x = partialUvsMargin + partialUvsSize;
			uvs[3].x = partialUvsMargin + partialUvsSize;

			uvs[2].y = partialUvsMargin;
			uvs[3].y = partialUvsMargin;
	
			uvs[0].y = partialUvsMargin + partialUvsSize;
			uvs[1].y = partialUvsMargin + partialUvsSize;
	
		    geometry.faceVertexUvs[0][0] = uvs;
		}

	    return geometry;
	}

	GTA.Render.MapRender.prototype.modifyHeights = function(h, no, height, step) {
	    if (no == 1) {
	        h.secondHeight = height * step;
	        h.firstHeight = height * (step+1);
	    }
	    else if (no == 2) {
	        h.firstHeight = height * step;
	        h.secondHeight = height * (step + 1);
	    }
	}

	GTA.Render.MapRender.prototype.CreateEdge = function(start, span, slopeType, faceType) {
	    var h = new Object();
	    h.firstHeight = tileSize;
	    h.secondHeight = tileSize;
	    var partialUvs = false;

	    if (slopeType <= 2) { // Up
	        var step = slopeType - 1;
	        var no = (faceType != FaceType.Left) ? (faceType != FaceType.Right) ? 0 : 2 : 1;
	        this.modifyHeights(h, no, tileSizeH, step);
	    }
	    else if (slopeType <= 4) { // Down
	        var step = slopeType - 3;
	        var no = (faceType != FaceType.Left) ? (faceType != FaceType.Right) ? 0 : 1 : 2;
	        this.modifyHeights(h, no, tileSizeH, step);
	    }
	    else if (slopeType <= 6) { // Left
	        var step = slopeType - 5;
	        var no = (faceType != FaceType.Bottom) ? (faceType != FaceType.Top) ? 0 : 2 : 1;
	        this.modifyHeights(h, no, tileSizeH, step);
	    }
	    else if (slopeType <= 8) { // Right
	        var step = slopeType - 7;
	        var no = (faceType != FaceType.Bottom) ? (faceType != FaceType.Top) ? 0 : 1 : 2;
	        this.modifyHeights(h, no, tileSizeH, step);
	    }
	    else if (slopeType >= 33 && slopeType <= 40) { // Right 7 degree
	        var step = slopeType - 33;
	        var no = (faceType != FaceType.Bottom) ? (faceType != FaceType.Top) ? 0 : 1 : 2;
	        this.modifyHeights(h, no, tileSizeE, step);
	    }
	    else if (slopeType >= 41 && slopeType <= 44); // 45 degree slopes. No need to modify heights
	    else if (slopeType >= 45 && slopeType <= 48); // Diagonals. No need to intepret heights.
		else if(slopeType >= 53 && slopeType <= 61)
		{
			var size = tileSizePartial;
			partialUvs = true;
			span.x /= paritalBlockRatio;
			span.y /= paritalBlockRatio;
	
			start.x /= paritalBlockRatio;
			start.y /= paritalBlockRatio;
	
			if(slopeType == 53)
			{
				//Left, center
				start.x += -tileSizeH + size/2;
			}
			else if(slopeType == 54)
			{
				//Right center
				start.x += tileSizeH - size/2;
			}
			else if(slopeType == 55)
			{
				//Top center
				start.y += tileSizeH - size/2;		
			}
			else if(slopeType == 56)
			{
				//Bottom center
				start.y += -tileSizeH + size/2;	
			}
			else if(slopeType == 57)
			{
				//Top, left
				start.x += -tileSizeH + size/2;
				start.y += tileSizeH - size/2;
			}
			else if(slopeType == 58)
			{
				//Top, right
				start.x += tileSizeH - size/2;
				start.y += tileSizeH - size/2;
			}
			else if(slopeType == 59)
			{
				//Bottom, right
				start.x += tileSizeH - size/2;
				start.y += -tileSizeH + size/2;
			}
			else if(slopeType == 60)
			{
				//Bottom, right
				start.x += -tileSizeH + size/2;
				start.y += -tileSizeH + size/2;
			}
			else if(slopeType == 61)
			{
				//Center
			}
		}
	    else if (slopeType != undefined && slopeType != 63) {
	        alert("not implemented slopetype: " + slopeType);
	        debugger;
	    }

	    var v1 = new THREE.Vector3(start.x, start.y, -tileSizeH);
	    var v2 = new THREE.Vector3(start.x + span.x, start.y + span.y, -tileSizeH);
	    var v3 = new THREE.Vector3(start.x + span.x, start.y + span.y, -tileSizeH + h.firstHeight);
	    var v4 = new THREE.Vector3(start.x, start.y, -tileSizeH + h.secondHeight);

	    // Triangular slope-sides (Start Slopes)
	    if (this.isSlopeType(slopeType, upSlopeTypesTriangles)) { // Up
	        if (faceType == FaceType.Right)
	            geometry = this.CreateFace(v1, v2, v3, v4, new THREE.Face3(1, 0, 3));
	        else if (faceType == FaceType.Left)
	            geometry = this.CreateFace(v1, v2, v3, v4, new THREE.Face3(2, 1, 0));
	        else
	            geometry = this.CreateFace(v1, v2, v3, v4);
	    }
	    else if (this.isSlopeType(slopeType, downSlopeTypesTriangles)) {  // Down
	        if (faceType == FaceType.Right)
	            geometry = this.CreateFace(v1, v2, v3, v4, new THREE.Face3(2, 1, 0));
	        else if (faceType == FaceType.Left)
	            geometry = this.CreateFace(v1, v2, v3, v4, new THREE.Face3(1, 0, 3));
	        else
	            geometry = this.CreateFace(v1, v2, v3, v4);

	    }
	    else if (this.isSlopeType(slopeType, leftSlopeTypesTriangles)) { // Left
	        if (faceType == FaceType.Top) {
	            geometry = this.CreateFace(v1, v2, v3, v4, new THREE.Face3(1, 0, 3));
	        }
	        else if (faceType == FaceType.Bottom)
	            geometry = this.CreateFace(v1, v2, v3, v4, new THREE.Face3(2, 1, 0));
	        else
	            geometry = this.CreateFace(v1, v2, v3, v4);
	    }
	    else if (this.isSlopeType(slopeType, rightSlopeTypesTriangles)) {  // Right
	        if (faceType == FaceType.Top)
	            geometry = this.CreateFace(v1, v2, v3, v4, new THREE.Face3(2, 1, 0));
	        else if (faceType == FaceType.Bottom)
	            geometry = this.CreateFace(v1, v2, v3, v4, new THREE.Face3(1, 0, 3));
	        else
	            geometry = this.CreateFace(v1, v2, v3, v4);
	    }
	    else {
	        geometry = this.CreateFace(v1, v2, v3, v4);
	    }

	    var uvs = geometry.faceVertexUvs[0][0];

	    //Uvs according to height
	    uvs[0].y = h.secondHeight / tileSize;
	    uvs[1].y = h.firstHeight / tileSize;

		//Parital uvs
		if(partialUvs)
		{		
			uvs[1].x = partialUvsMargin;
			uvs[2].x = partialUvsMargin;
	
			uvs[0].x = partialUvsMargin + partialUvsSize;
			uvs[3].x = partialUvsMargin + partialUvsSize;
		}


	    geometry.faceVertexUvs[0][0] = uvs;

	    return geometry;
	}

	GTA.Render.MapRender.prototype.CreateFace = function(v1, v2, v3, v4, face) {
	    if (!face)
	        face = new THREE.Face4(3, 2, 1, 0);

	    //Edge Geometry
	    var g = new THREE.Geometry();

	    g.vertices.push(v1);
	    g.vertices.push(v2);
	    g.vertices.push(v3);
	    g.vertices.push(v4);

	    g.faces.push(face);
	    var faceuv = [
	        new THREE.Vector2(1, 1),
	        new THREE.Vector2(0, 1),
	        new THREE.Vector2(0, 0),
	        new THREE.Vector2(1, 0)
	    ];


	    g.faceVertexUvs[0].push(faceuv);
	    g.computeFaceNormals();

	    return g;
	}

	GTA.Render.MapRender.prototype.Rotate = function(target, x, y, z) {
	    if (x != 0)
	        target.rotation.x += (x / 360) * (Math.PI * 2);

	    if (y != 0)
	        target.rotation.y += (y / 360) * (Math.PI * 2);

	    if (z != 0)
	        target.rotation.z += (z / 360) * (Math.PI * 2);
	}



	GTA.Render.MapRender.prototype.RotateUV = function(target, value) {
	    if (value == 0) return;

	    var uvs = target.faceVertexUvs[0][0];

	    if (value == 90) {
	        uvs.push(uvs.shift());
	    }
	    else if (value == 180 || value == -180) {
	        uvs.push(uvs.shift());
	        uvs.push(uvs.shift());
	    }
	    else if (value == 270 || value == -90) {
	        uvs.unshift(uvs.pop());
	    }

	    target.faceVertexUvs[0][0] = uvs;
	    target.uvsNeedUpdate = true;
	}

	GTA.Render.MapRender.prototype.MirrorUV = function(target, value) {
	    var uvs = target.faceVertexUvs[0][0];

	    if (value == 'y') {
	        //Y mirror
	        uvs.reverse();
	    }
	    else {
	        //x mirror
	        uvs.reverse();
	        var f = uvs.shift();
	        uvs.push(f);
	        var f = uvs.shift();
	        uvs.push(f);
	    }

	    target.uvsNeedUpdate = true;
	}
	
	GTA.Render.MapRender.prototype.isSlopeType = function(type, array) 
	{
	    return $.inArray(type, array) != -1
	}
	
	
	
	
	//--------------------------

})();