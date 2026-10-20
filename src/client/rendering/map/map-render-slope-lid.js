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

export function installSlopeLid(MapRender) {
	MapRender.prototype.ModifyToSlope = function(v1, v2, v3, v4, sv1, sv2, slopeAmount, start) {
	    // Move completely down
	    v1.z -= tileSize - start;
	    v2.z -= tileSize - start;
	    v3.z -= tileSize - start;
	    v4.z -= tileSize - start;

	    sv1.z += slopeAmount;
	    sv2.z += slopeAmount;
	}

	MapRender.prototype.CreateLid = function(start, slopeType) {
	    var geometry;
		var size = tileSize;
		var height = tileSize;
		var partialUvs = false;

		////Partial Blocks
		if(slopeType >= SlopeType.PartialLow && slopeType <= SlopeType.PartialHigh)
		{
			const bounds = getPartialBounds(slopeType);
			partialUvs = true;

			if (bounds) {
				start.set(bounds.maxX, bounds.minY);
				size = bounds.maxX - bounds.minX;
				height = bounds.maxY - bounds.minY;
			}
		}

	    var v1 = new THREE.Vector3(start.x, start.y, tileSizeH);
	    var v2 = new THREE.Vector3(start.x - size, start.y, tileSizeH);
	    var v3 = new THREE.Vector3(start.x - size, start.y + height, tileSizeH);
	    var v4 = new THREE.Vector3(start.x, start.y + height, tileSizeH);

	    // Whole slopes
	    if (slopeType == SlopeType.DiagonalFacingDown) { // Down
	        this.ModifyToSlope(v1, v2, v3, v4, v3, v4, tileSize, 0);
	    }
	    else if (slopeType == SlopeType.DiagonalFacingUp) { // Up
	        this.ModifyToSlope(v1, v2, v3, v4, v1, v2, tileSize, 0);
	    }
	    else if (slopeType == SlopeType.DiagonalFacingLeft) { // Left
	        this.ModifyToSlope(v1, v2, v3, v4, v2, v3, tileSize, 0);
	    }
	    else if (slopeType == SlopeType.DiagonalFacingRight) { // Right
	        this.ModifyToSlope(v1, v2, v3, v4, v1, v4, tileSize, 0);
	    }

	    // Half degree slopes
	    if (slopeType == SlopeType.UpLow) // Up
	    {
	        this.ModifyToSlope(v1, v2, v3, v4, v3, v4, tileSizeH, 0);
	    }
	    else if (slopeType == SlopeType.UpHigh) {
	        this.ModifyToSlope(v1, v2, v3, v4, v3, v4, tileSizeH, tileSizeH);
	    }
	    else if (slopeType == SlopeType.DownLow) // Down
	    {
	        this.ModifyToSlope(v1, v2, v3, v4, v1, v2, tileSizeH, 0);
	    }
	    else if (slopeType == SlopeType.DownHigh) {
	        this.ModifyToSlope(v1, v2, v3, v4, v1, v2, tileSizeH, tileSizeH);
	    }
	    else if (slopeType == SlopeType.LeftLow)  // Left low
	    {
	        this.ModifyToSlope(v1, v2, v3, v4, v2, v3, tileSizeH, 0);
	    }
	    else if (slopeType == SlopeType.LeftHigh)  // Left high
	    {
	        this.ModifyToSlope(v1, v2, v3, v4, v2, v3, tileSizeH, tileSizeH);
	    }
	    else if (slopeType == SlopeType.RightLow)  // Right low
	    {
	        this.ModifyToSlope(v1, v2, v3, v4, v1, v4, tileSizeH, 0);
	    }
	    else if (slopeType == SlopeType.RightHigh)   // Right high
	    {
	        this.ModifyToSlope(v1, v2, v3, v4, v1, v4, tileSizeH, tileSizeH);
	    }

	    // Eight slopes
	    else if (slopeType >= SlopeType.Up7Low && slopeType <= SlopeType.Up7High) { // Up
	        var offset = slopeType - SlopeType.Up7Low;
	        this.ModifyToSlope(v1, v2, v3, v4, v3, v4, tileSizeE, tileSizeE * offset);
	    }
	    else if (slopeType >= SlopeType.Down7Low && slopeType <= SlopeType.Down7High) {  // Down
	        var offset = slopeType - SlopeType.Down7Low;
	        this.ModifyToSlope(v1, v2, v3, v4, v1, v2, tileSizeE, tileSizeE * offset);
	    }
	    else if (slopeType >= SlopeType.Left7Low && slopeType <= SlopeType.Left7High) { // Left
	        var offset = slopeType - SlopeType.Left7Low;
	        this.ModifyToSlope(v1, v2, v3, v4, v2, v3, tileSizeE, tileSizeE * offset);
	    }
	    else if (slopeType >= SlopeType.Right7Low && slopeType <= SlopeType.Right7High) { // Right
	        var offset = slopeType - SlopeType.Right7Low;
	        this.ModifyToSlope(v1, v2, v3, v4, v1, v4, tileSizeE, tileSizeE * offset);
	    }

	    // Diagonals
	    if (slopeType == SlopeType.DiagonalFacingDownRight) { // Bottom Right
	        geometry = this.CreateFace(v1, v2, v3, v4, triangle(3, 2, 1));
	    }
	    else if (slopeType == SlopeType.DiagonalFacingDownLeft) {  // Bottom Left
	        geometry = this.CreateFace(v1, v2, v3, v4, triangle(0, 3, 2));
	    }
	    else if (slopeType == SlopeType.DiagonalFacingUpRight) { // Top Right
	        geometry = this.CreateFace(v1, v2, v3, v4, triangle(2, 1, 0));
	    }
	    else if (slopeType == SlopeType.DiagonalFacingUpLeft) {  // Top Left
	        geometry = this.CreateFace(v1, v2, v3, v4, triangle(1, 0, 3));
	    }
	    else {
	        geometry = this.CreateFace(v1, v2, v3, v4);
	    }

		//Parital uvs
		if(partialUvs)
		{		
			var uvs = geometry.uvs;
	
			uvs[1].x = partialUvsMargin;
			uvs[2].x = partialUvsMargin;
	
			uvs[0].x = partialUvsMargin + partialUvsSize;
			uvs[3].x = partialUvsMargin + partialUvsSize;

			uvs[2].y = partialUvsMargin;
			uvs[3].y = partialUvsMargin;
	
			uvs[0].y = partialUvsMargin + partialUvsSize;
			uvs[1].y = partialUvsMargin + partialUvsSize;
	
		    geometry.uvs = uvs;
		}

	    return geometry;
	}

}
