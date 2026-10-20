export function installSlopeUv(MapRender) {

	MapRender.prototype.Rotate = function(target, x, y, z) {
	    if (x != 0)
	        target.rotation.x += (x / 360) * (Math.PI * 2);

	    if (y != 0)
	        target.rotation.y += (y / 360) * (Math.PI * 2);

	    if (z != 0)
	        target.rotation.z += (z / 360) * (Math.PI * 2);
	}



	MapRender.prototype.RotateUV = function(target, value) {
	    if (value == 0) return;

	    var uvs = target.uvs;

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

	    target.uvs = uvs;
	    target.uvsNeedUpdate = true;
	}

	MapRender.prototype.MirrorUV = function(target, value) {
	    var uvs = target.uvs;

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
	
	MapRender.prototype.isSlopeType = function(type, array) 
	{
	    return array.includes(type)
	}

}
