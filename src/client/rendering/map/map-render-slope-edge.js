import * as THREE from 'three';
import { GTA2FaceType as FaceType, GTA2SlopeType as SlopeType } from '../../../shared/domain/world/gta2-enums';
import { WORLD } from '../../../shared/domain/world/world';

const triangle = (a, b, c) => [a, b, c];
const tileSize = WORLD.tileSize;
const tileSizeH = tileSize / 2;
const tileSizeE = tileSize / 8;
const paritalBlockRatio = 8 / 3;
const tileSizePartial = tileSize / paritalBlockRatio;
const partialUvsMargin = (tileSize - tileSizePartial) / 2 / tileSize;
const partialUvsSize = tileSizePartial / tileSize;
const upSlopeTypesTriangles = [SlopeType.DiagonalFacingDown, SlopeType.UpLow];
const downSlopeTypesTriangles = [SlopeType.DiagonalFacingUp, SlopeType.DownLow];
const leftSlopeTypesTriangles = [SlopeType.DiagonalFacingLeft, SlopeType.LeftLow];
const rightSlopeTypesTriangles = [SlopeType.DiagonalFacingRight, SlopeType.RightLow];

function getPartialBounds(slopeType) {
	const min = -tileSizeH;
	const max = tileSizeH;
	const partial = tileSizePartial;
	const center = partial / 2;
	const left = min;
	const negativeEdge = min + partial;
	const positiveEdge = max - partial;
	const centerMin = -center;
	const centerMax = center;

	switch (slopeType) {
		case SlopeType.PartialLeftCenter:
			return { minX: left, maxX: negativeEdge, minY: min, maxY: max };
		case SlopeType.PartialRightCenter:
			return { minX: positiveEdge, maxX: max, minY: min, maxY: max };
		case SlopeType.PartialTopCenter:
			return { minX: min, maxX: max, minY: positiveEdge, maxY: max };
		case SlopeType.PartialBottomCenter:
			return { minX: min, maxX: max, minY: min, maxY: negativeEdge };
		case SlopeType.PartialTopLeft:
			return { minX: left, maxX: negativeEdge, minY: positiveEdge, maxY: max };
		case SlopeType.PartialTopRight:
			return { minX: positiveEdge, maxX: max, minY: positiveEdge, maxY: max };
		case SlopeType.PartialBottomRight:
			return { minX: positiveEdge, maxX: max, minY: min, maxY: negativeEdge };
		case SlopeType.PartialBottomLeft:
			return { minX: left, maxX: negativeEdge, minY: min, maxY: negativeEdge };
		case SlopeType.PartialCenter:
			return { minX: centerMin, maxX: centerMax, minY: centerMin, maxY: centerMax };
		default:
			return undefined;
	}
}

export function installSlopeEdge(MapRender) {

	MapRender.prototype.modifyHeights = function(h, no, height, step) {
	    if (no == 1) {
	        h.secondHeight = height * step;
	        h.firstHeight = height * (step+1);
	    }
	    else if (no == 2) {
	        h.firstHeight = height * step;
	        h.secondHeight = height * (step + 1);
	    }
	}

	MapRender.prototype.CreateEdge = function(start, span, slopeType, faceType, partialSpecial) {
        var geometry;
	    var h = new Object();
	    h.firstHeight = tileSize;
	    h.secondHeight = tileSize;
	    var partialUvs = false;

	    if (slopeType >= SlopeType.UpLow && slopeType <= SlopeType.UpHigh) { // Up
	        var step = slopeType - SlopeType.UpLow;
	        var no = (faceType != FaceType.Left) ? (faceType != FaceType.Right) ? 0 : 2 : 1;
	        this.modifyHeights(h, no, tileSizeH, step);
	    }
	    else if (slopeType >= SlopeType.DownLow && slopeType <= SlopeType.DownHigh) { // Down
	        var step = slopeType - SlopeType.DownLow;
	        var no = (faceType != FaceType.Left) ? (faceType != FaceType.Right) ? 0 : 1 : 2;
	        this.modifyHeights(h, no, tileSizeH, step);
	    }
	    else if (slopeType >= SlopeType.LeftLow && slopeType <= SlopeType.LeftHigh) { // Left
	        var step = slopeType - SlopeType.LeftLow;
	        var no = (faceType != FaceType.Bottom) ? (faceType != FaceType.Top) ? 0 : 2 : 1;
	        this.modifyHeights(h, no, tileSizeH, step);
	    }
	    else if (slopeType >= SlopeType.RightLow && slopeType <= SlopeType.RightHigh) { // Right
	        var step = slopeType - SlopeType.RightLow;
	        var no = (faceType != FaceType.Bottom) ? (faceType != FaceType.Top) ? 0 : 1 : 2;
	        this.modifyHeights(h, no, tileSizeH, step);
	    }
		else if (slopeType >= SlopeType.Right7Low && slopeType <= SlopeType.Right7High) { // Right 7 degree
	        var step = slopeType - SlopeType.Right7Low;
	        var no = (faceType != FaceType.Bottom) ? (faceType != FaceType.Top) ? 0 : 1 : 2;
	        this.modifyHeights(h, no, tileSizeE, step);
	    }
	    else if (slopeType >= SlopeType.DiagonalFacingDown && slopeType <= SlopeType.DiagonalFacingRight); // 45 degree slopes. No need to modify heights
	    else if (slopeType >= SlopeType.DiagonalFacingUpLeft && slopeType <= SlopeType.DiagonalFacingDownRight); // Diagonals. No need to intepret heights.
		else if(slopeType >= SlopeType.PartialLow && slopeType <= SlopeType.PartialHigh)
		{
			const bounds = getPartialBounds(slopeType);
			partialUvs = true;

			// Partial blocks occupy a 3/8-tile strip (or a 3/8-tile corner),
			// not a centered, uniformly shrunken copy of the requested edge.
			if (bounds) {
				const special = !!partialSpecial;
				if (faceType == FaceType.Left) {
					start.set(special ? bounds.maxX : bounds.minX, bounds.minY);
					span.set(0, bounds.maxY - bounds.minY);
				}
				else if (faceType == FaceType.Right) {
					start.set(special ? bounds.minX : bounds.maxX, bounds.maxY);
					span.set(0, bounds.minY - bounds.maxY);
				}
				else if (faceType == FaceType.Top) {
					start.set(bounds.minX, special ? bounds.minY : bounds.maxY);
					span.set(bounds.maxX - bounds.minX, 0);
				}
				else if (faceType == FaceType.Bottom) {
					start.set(bounds.maxX, special ? bounds.maxY : bounds.minY);
					span.set(bounds.minX - bounds.maxX, 0);
				}
			}
		}
	    else if (slopeType != undefined && slopeType != 63) {
	        // Unsupported slope variants retain the original vertical edge fallback.
	    }

	    var v1 = new THREE.Vector3(start.x, start.y, -tileSizeH);
	    var v2 = new THREE.Vector3(start.x + span.x, start.y + span.y, -tileSizeH);
	    var v3 = new THREE.Vector3(start.x + span.x, start.y + span.y, -tileSizeH + h.firstHeight);
	    var v4 = new THREE.Vector3(start.x, start.y, -tileSizeH + h.secondHeight);

	    // Triangular slope-sides (Start Slopes)
	    if (this.isSlopeType(slopeType, upSlopeTypesTriangles)) { // Up
	        if (faceType == FaceType.Right)
	            geometry = this.CreateFace(v1, v2, v3, v4, triangle(1, 0, 3));
	        else if (faceType == FaceType.Left)
	            geometry = this.CreateFace(v1, v2, v3, v4, triangle(2, 1, 0));
	        else
	            geometry = this.CreateFace(v1, v2, v3, v4);
	    }
	    else if (this.isSlopeType(slopeType, downSlopeTypesTriangles)) {  // Down
	        if (faceType == FaceType.Right)
	            geometry = this.CreateFace(v1, v2, v3, v4, triangle(2, 1, 0));
	        else if (faceType == FaceType.Left)
	            geometry = this.CreateFace(v1, v2, v3, v4, triangle(1, 0, 3));
	        else
	            geometry = this.CreateFace(v1, v2, v3, v4);

	    }
	    else if (this.isSlopeType(slopeType, leftSlopeTypesTriangles)) { // Left
	        if (faceType == FaceType.Top) {
	            geometry = this.CreateFace(v1, v2, v3, v4, triangle(1, 0, 3));
	        }
	        else if (faceType == FaceType.Bottom)
	            geometry = this.CreateFace(v1, v2, v3, v4, triangle(2, 1, 0));
	        else
	            geometry = this.CreateFace(v1, v2, v3, v4);
	    }
	    else if (this.isSlopeType(slopeType, rightSlopeTypesTriangles)) {  // Right
	        if (faceType == FaceType.Top)
	            geometry = this.CreateFace(v1, v2, v3, v4, triangle(2, 1, 0));
	        else if (faceType == FaceType.Bottom)
	            geometry = this.CreateFace(v1, v2, v3, v4, triangle(1, 0, 3));
	        else
	            geometry = this.CreateFace(v1, v2, v3, v4);
	    }
	    else {
	        geometry = this.CreateFace(v1, v2, v3, v4);
	    }

	    var uvs = geometry.uvs;

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


	    geometry.uvs = uvs;

	    return geometry;
	}

    MapRender.prototype.CreateFace = function(v1, v2, v3, v4, face) {
        return { vertices: [v1, v2, v3, v4], indices: face || [3, 2, 0, 2, 1, 0],
            uvs: [new THREE.Vector2(1, 1), new THREE.Vector2(0, 1), new THREE.Vector2(0, 0), new THREE.Vector2(1, 0)] };
    };

}
