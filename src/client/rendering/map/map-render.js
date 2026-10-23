// Slope and UV rules preserved from the original renderer; all GPU meshes use BufferGeometry.
import * as THREE from 'three';
import { GTA2FaceType as FaceType, GTA2MapLimits, GTA2SlopeType as SlopeType } from '../../../shared/domain/world/gta2-enums';
import { WORLD, worldSurfaceZ } from '../../../shared/domain/world/world';
import { faceGeometry, pixelTexture } from '../textures';
import { presentationSortKey } from '../spatial-depth';
import { installSlopeEdge } from './map-render-slope-edge.js';
import { installSlopeLid } from './map-render-slope-lid.js';
import { installSlopeUv } from './map-render-slope-uv.js';
var tileSize = WORLD.tileSize;
var tileSizeH = tileSize / 2;
var flatWallOffset = 0.5;

var upSlopeTypesTriangles = [SlopeType.DiagonalFacingDown, SlopeType.UpLow];
var downSlopeTypesTriangles = [SlopeType.DiagonalFacingUp, SlopeType.DownLow];
var leftSlopeTypesTriangles = [SlopeType.DiagonalFacingLeft, SlopeType.LeftLow];
var rightSlopeTypesTriangles = [SlopeType.DiagonalFacingRight, SlopeType.RightLow];



	

	//constructor
	export class MapRender {
    constructor() {


	    this.scene = false; // THREE.Scene;		
		this.camera = false;
		
		this.sceneObjects = false; // Array containing all the Object3D containing a whole tile (full height)
		
		this.tileCache = new Array();
		this.flatTileCache = new Array();
		this.doubleSidedFlatTileCache = new Array();
		this.nonOccludingTileCache = new Array();
		this.surfaceTileCache = new Array();
		this.surfaceFlatTileCache = new Array();
		this.surfaceDoubleSidedFlatTileCache = new Array();
		this.enabledLevels = new Set(Array.from({ length: GTA2MapLimits.Layers }, (_, level) => level));
		this.animations = [];
		this.animationFrames = new Map();
		this.materialFactory = undefined;
		this.renderOrder = undefined;
		
		this.visibleSceneObjects = new Array(); //All the tiles currently drawn

		return this;
    }
	};
	
	
	
	
	MapRender.prototype.render = function(now) {
        // Map animations advance on the source render cadence. The browser can
        // render at 60 Hz, but a tile still changes as one discrete authored
        // frame; crossfading two transparent tile textures causes shimmer on
        // mobile GPUs and does not match GTA2's renderer.
        const frameClock = Math.floor((now ?? performance.now()) / 16.6667);
        for (const animation of this.animations) {
			const materials = [
				this.tileCache[animation.base],
				this.nonOccludingTileCache[animation.base],
				this.surfaceTileCache[animation.base],
				this.surfaceFlatTileCache[animation.base],
				this.surfaceDoubleSidedFlatTileCache[animation.base],
			].filter(Boolean);
            if (!materials.length || !animation.tiles.length) continue;
            const cycle = Math.floor(frameClock / Math.max(1, animation.frameRate));
            const frame = animation.repeat && cycle >= animation.repeat * animation.tiles.length ? animation.tiles.length - 1 : cycle % animation.tiles.length;
            if (this.animationFrames.get(animation.base) === frame) continue;
            const pixels = this.style.tiles[animation.tiles[frame]];
            if (!pixels) continue;
            for (const material of materials) {
                const previous = material.map;
                material.map = pixelTexture(pixels);
                material.needsUpdate = true;
                previous?.dispose();
            }
            this.animationFrames.set(animation.base, frame);
        }
        var camX, camY, camW, camH, visibleSceneObject;
		const center = this.camera.userData?.gta2Center;
		camX = Math.round((center?.x ?? this.camera.position.x)/tileSize);
		camY = Math.round((center?.y ?? this.camera.position.y)/tileSize);

		// Keep a small tile margin for animated faces. Perspective culling uses
		// the camera frustum; orthographic callers remain supported for tools.
		if (this.camera.isOrthographicCamera || this.camera.type === 'OrthographicCamera') {
			camW = Math.ceil((this.camera.right - this.camera.left) / tileSize) + 4;
			camH = Math.ceil((this.camera.top - this.camera.bottom) / tileSize) + 4;
		} else {
			camW = Math.ceil(2 * this.camera.position.z * Math.tan(this.camera.fov * Math.PI / 360) * this.camera.aspect / tileSize) + 4;
			camH = Math.ceil(2 * this.camera.position.z * Math.tan(this.camera.fov * Math.PI / 360) / tileSize) + 4;
		}
        if (camW % 2) camW++;
        if (camH % 2) camH++;


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
					var mapY = -y;
					var sceneObjectY = sceneObjectX[mapY];
					// Large retail districts contain more than 100,000 blocks. Build
					// only the cells entering the camera window; the old renderer
					// constructed every polygon before the first frame, which blocked
					// the browser long enough for the multiplayer socket heartbeat to
					// expire on Industrial, Downtown, and Residential.
					if(sceneObjectY === undefined && mapY >= 0 && mapY < this.mapData.map[x].length && this.mapData.map[x][mapY] !== undefined){
						sceneObjectY = this.CreateTile(x, mapY);
						sceneObjectX[mapY] = sceneObjectY;
					}
					if(sceneObjectY != undefined){

						if(sceneObjectY.parent == null){
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
	
	
	
	MapRender.prototype.CreateMesh = function(mapData, styleData, options){
        this.style = styleData;
        this.mapData = mapData;
        this.animations = mapData.animations || [];
		this.materialFactory = options?.materialFactory;
		this.renderOrder = options?.renderOrder;
		this.visibleSceneObjects = [];
		this.tileCache = new Array();
		this.flatTileCache = new Array();
		this.doubleSidedFlatTileCache = new Array();
		this.nonOccludingTileCache = new Array();
		this.surfaceTileCache = new Array();
		this.surfaceFlatTileCache = new Array();
		this.surfaceDoubleSidedFlatTileCache = new Array();
		this.animationFrames = new Map();
		// Keep the same coordinate-indexed cache shape as the retail culler,
		// but leave cells undefined until they are visible.
		this.sceneObjects = Array.from({ length: mapData.map.length }, () => new Array(mapData.map[0]?.length ?? GTA2MapLimits.Height));
	}	

	MapRender.prototype.CreateTile = function(x, y) {
		var tileObject = new THREE.Object3D();
		var column = this.mapData.map[x]?.[y];
		if (!column) return tileObject;
		for (var z = 0; z < GTA2MapLimits.Layers; z++) {
			var block = column[z];
			if (block != undefined) tileObject.add(this.CreateBlock(x, y, z, block));
		}
		return tileObject;
	};

	MapRender.prototype.setEnabledLevels = function(levels) {
		this.enabledLevels = new Set(levels.filter(level => Number.isInteger(level) && level >= 0 && level < GTA2MapLimits.Layers));
		if (!this.scene || !this.scene.traverse) return;
		this.scene.traverse(object => {
			const face = object.userData?.gta2MapFace;
			if (face && Number.isInteger(face.z)) {
				object.visible = this.enabledLevels.has(face.z);
				if (object.userData?.gta2RenderPass) object.userData.gta2BaseVisible = object.visible;
			}
		});
	};
	

	MapRender.prototype.CreateBlock = function(x, y, z, block) {
		var blockObject = new THREE.Object3D();
		var addFace = (face, type, forceFlat, doubleSided, outwardFlat) => {
			if (face == undefined || face.tileNumber == 0) return;
			var blockPolygon = this.CreatePolygon(x, y, z, face, type, block, forceFlat, doubleSided, outwardFlat);
			if (blockPolygon != false) blockObject.add(blockPolygon);
		};
		// A flat face paired with a structural neighbor is wall art attached to
		// that supported plane. Do not borrow the opposite face onto the other
		// side of the block: that creates the hanging reverse panel seen in
		// MP2-comp at (228,38,z3-4). Unanchored flat pairs retain the retail
		// opposite-face rule used by fences and other free-standing strips.
		var addFlatPair = (first, second, firstType, secondType) => {
			var firstSupported = first != undefined && first.flat && this.hasStructuralSupport(x, y, z, firstType);
			var secondSupported = second != undefined && second.flat && this.hasStructuralSupport(x, y, z, secondType);
			if (firstSupported || secondSupported) {
				if (firstSupported) addFace(first, firstType, false, true, true);
				if (secondSupported) addFace(second, secondType, false, true, true);
				return;
			}
			if (first != undefined && second != undefined) {
				if (second.flat) addFace(first, firstType, true);
				if (first.flat) addFace(second, secondType, true);
			}
			if (first != undefined && (!second || !second.flat || first.flat)) addFace(first, firstType, false);
			if (second != undefined && (!first || !first.flat || second.flat)) addFace(second, secondType, false);
		};
		addFlatPair(block.Left, block.Right, FaceType.Left, FaceType.Right);
		addFlatPair(block.Top, block.Bottom, FaceType.Top, FaceType.Bottom);
		addFace(block.Lid, FaceType.Lid, false);
		return blockObject;
	}

	MapRender.prototype.hasStructuralSupport = function(x, y, z, type) {
		if (!this.mapData || type == FaceType.Lid) return false;
		var neighborX = x, neighborY = y, opposite;
		if (type == FaceType.Left) { neighborX--; opposite = 'Right'; }
		else if (type == FaceType.Right) { neighborX++; opposite = 'Left'; }
		else if (type == FaceType.Top) { neighborY--; opposite = 'Bottom'; }
		else if (type == FaceType.Bottom) { neighborY++; opposite = 'Top'; }
		else return false;
		var neighbor = this.mapData.map[neighborX]?.[neighborY]?.[z];
		var neighborFace = neighbor?.[opposite];
		return !!neighborFace && (neighborFace.wall || neighborFace.bulletWall);
	}


	MapRender.prototype.CreatePolygon = function(x, y, z, face, type, block, forceFlat, doubleSided, outwardFlat) {
        var geometry, wireMaterial;
	    var material;
		const surface = type == FaceType.Lid;
		var renderFace = forceFlat && !face.flat ? { ...face, flat: true } : face;
	    if (!face.tileNumber) {
			
	         return false;
	         material = new THREE.MeshBasicMaterial({ color: 0xFF00FF });
	    }
	    else {
			material = this.materialFactory?.(renderFace, type, block, surface ? 'surface' : 'occluder')
			?? this.getTile(renderFace.tileNumber, renderFace.flat, doubleSided,
				surface,
				!surface);
			if (material.depthTest !== true || material.depthWrite !== true) {
				// Every map face participates in the depth buffer. The explicit GTA2
				// pass still controls category order, while depth resolves overlap
				// within each pass.
				material.depthTest = true;
				material.depthWrite = true;
				material.needsUpdate = true;
			}
			if (surface && (!material.transparent || material.opacity !== 1)) {
				// Lids and bridge surfaces use the transparent queue while preserving
				// full opacity. The explicit pass pipeline controls category order.
				material.transparent = true;
				material.opacity = 1;
				material.needsUpdate = true;
			}
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
	        geometry = this.CreateEdge(new THREE.Vector2(-tileSizeH, tileSizeH), new THREE.Vector2(tileSize, 0), block.slopeType, type, forceFlat);
	    }
	    else if (type == FaceType.Bottom) {
	        geometry = this.CreateEdge(new THREE.Vector2(tileSizeH, -tileSizeH), new THREE.Vector2(-tileSize, 0), block.slopeType, type, forceFlat);
	    }
	    else if (type == FaceType.Left) {
	        geometry = this.CreateEdge(new THREE.Vector2(-tileSizeH, -tileSizeH), new THREE.Vector2(0, tileSize), block.slopeType, type, forceFlat);
	    }
	    else if (type == FaceType.Right) {
	        geometry = this.CreateEdge(new THREE.Vector2(tileSizeH, tileSizeH), new THREE.Vector2(0, -tileSize), block.slopeType, type, forceFlat);
	    }

	    var materialList = [material];
	    if (false) {
	        wireMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, wireframe: true, transparent: true });
	        materialList.push(wireMaterial);
	    }

	    var edge = new THREE.Group();
	    edge.userData.gta2MapFace = { x, y, z, type };
		edge.visible = this.enabledLevels.has(z);
		// Keep both structural faces and horizontal lids at their authored block
		// level. A lower-level lid must not be submitted after an upper slope wall.
	    const facePriority = type == FaceType.Lid ? 1 : 0;
	    const mapLevel = z;
		edge.userData.gta2RenderPass = {
			mapLevel,
			band: surface ? 'map-surface' : 'map-wall',
		};
		edge.userData.gta2BaseVisible = edge.visible;
		edge.renderOrder = this.renderOrder ?? presentationSortKey(
			mapLevel,
			'map',
			facePriority,
			worldSurfaceZ(z),
		);

	    var x = x * tileSize;
	    var y = y * tileSize;
	    var z = z * tileSize;

	    if (type == FaceType.Lid && (block.slopeType <= SlopeType.DiagonalFacingDownRight && block.slopeType >= SlopeType.DiagonalFacingUpLeft)) {

	        if (block.slopeType == SlopeType.DiagonalFacingDownRight) { // Bottom Right
	        }
	        else if (block.slopeType == SlopeType.DiagonalFacingDownLeft) {  // Bottom Left
	            this.RotateUV(geometry, 270);
	        }
	        else if (block.slopeType == SlopeType.DiagonalFacingUpRight) { // Top Right
	            //alert("test");
	            this.RotateUV(geometry, 90);
	        }
	        else if (block.slopeType == SlopeType.DiagonalFacingUpLeft) {  // Top Left
	            this.RotateUV(geometry, 180);
	        }
		        if (renderFace.flip == 1)
	            this.MirrorUV(geometry, "x");

		        this.RotateUV(geometry, renderFace.rotation);
	    } else {
	        if (type != FaceType.Lid) {
	            if (this.isSlopeType(block.slopeType, upSlopeTypesTriangles)) { // Up
	                if (type == FaceType.Right)
	                    this.RotateUV(geometry, 180);
	                else if (type == FaceType.Left)
	                    this.RotateUV(geometry, 90);
	            }
	            else if (this.isSlopeType(block.slopeType, downSlopeTypesTriangles)) { // Down
	                if (type == FaceType.Right)
	                    this.RotateUV(geometry, 90);
	                else if (type == FaceType.Left)
	                    this.RotateUV(geometry, 180);
	            }
	            else if (this.isSlopeType(block.slopeType, leftSlopeTypesTriangles)) { // Left
	                if (type == FaceType.Top) {
	                    //this.RotateUV(geometry, -90);
	                }
	                else if (type == FaceType.Bottom)
	                    this.RotateUV(geometry, 90);
	            }
	            else if (this.isSlopeType(block.slopeType, rightSlopeTypesTriangles)) {  // Right
	                if (type == FaceType.Top)
	                    this.RotateUV(geometry, 90);
	                else if (type == FaceType.Bottom)
	                    this.RotateUV(geometry, 180);
	            }
	        }


		        this.RotateUV(geometry, renderFace.rotation);

		        if (renderFace.flip)
			{
				this.MirrorUV(geometry, 'x');
	        }
	    }

	    edge.position.x = x;
	    edge.position.y = -y;
	    edge.position.z = z;
		if (outwardFlat) {
			if (type == FaceType.Left) edge.position.x += flatWallOffset;
			else if (type == FaceType.Right) edge.position.x -= flatWallOffset;
			else if (type == FaceType.Top) edge.position.y -= flatWallOffset;
			else if (type == FaceType.Bottom) edge.position.y += flatWallOffset;
		}
		
		const buffer = faceGeometry(geometry);
	    for (const mat of materialList) edge.add(new THREE.Mesh(buffer, mat));

	    //scene.add(edge);
		return edge;
	}
	
	MapRender.prototype.getTile = function(tileNo, flat, doubleSided, surface, occluding = true) {
	    var cacheStore = surface
			? (flat ? (doubleSided ? this.surfaceDoubleSidedFlatTileCache : this.surfaceFlatTileCache) : this.surfaceTileCache)
			: (flat
				? (doubleSided ? this.doubleSidedFlatTileCache : this.flatTileCache)
				: (occluding ? this.tileCache : this.nonOccludingTileCache));
	    var cache = cacheStore[tileNo];
	    if (cache != undefined)
	        return cache;
	    // STY stores real tiles 0..991. GMP reserves 992..1022 for the
	    // executable's asynchronous animation slots and uses 1023 as a dummy
	    // lid marker for three-sided diagonal slopes. The marker still needs a
	    // material so the authored slope geometry can be built, but it has no
	    // texture to decode.
	    if (tileNo >= 992 && tileNo <= 1023 && !this.style.tiles[tileNo]) {
	        var reservedMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, side: THREE.FrontSide });
	        cacheStore[tileNo] = reservedMaterial;
	        return reservedMaterial;
	    }
	    var texture = pixelTexture(this.style.tiles[tileNo]);
	    texture.needsUpdate = true;
    // Map tiles are intentionally unlit. Retail districts can contain more
    // lights than WebGL's fragment uniform limit supports, and the authored
    // light animation is rendered separately by the scene lighting layer.
	// GMP faces are authored as individual polygons. Solid walls keep the
	// source-facing winding/culling; supported flat wall art is explicitly
	// double-sided on its structural plane, while unanchored flat pairs use the
	// opposite-face rule in addFlatPair.
	    var material = new THREE.MeshBasicMaterial({ map: texture, transparent: !!flat, alphaTest: flat ? 0.01 : 0, side: doubleSided ? THREE.DoubleSide : THREE.FrontSide });

	    cacheStore[tileNo] = material;

	    return material;
	}

	/*
	Up = v3, v4
	Down = v1, v2
	Left = v2, v3
	Right = v1, v4
	*/

	
	
	
	//--------------------------

installSlopeLid(MapRender);
installSlopeEdge(MapRender);
installSlopeUv(MapRender);

