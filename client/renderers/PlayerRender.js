
var rotObjectMatrix;
function rotateAroundObjectAxis(object, axis, radians) {
    rotObjectMatrix = new THREE.Matrix4();
    rotObjectMatrix.makeRotationAxis(axis.normalize(), radians);
   // object.matrix.multiplySelf(rotObjectMatrix);      // post-multiply
    object.rotation.getRotationFromMatrix(object.matrix, object.scale);
}


(function(){
	GTA.namespace("GTA.render");
	//constructor
	GTA.render.PlayerRender = function( player ) {

		this.player = player;
		return this;
	};

	GTA.render.PlayerRender.prototype.CreateMesh = function()
	{

		this.geometry = new THREE.CubeGeometry( 10, 5, 64 );

		this.material = new THREE.MeshBasicMaterial( { color: 0xfff444 } );

		this.mesh = new THREE.Mesh( this.geometry, this.material );
		return this.mesh;
	}
	GTA.render.PlayerRender.prototype.Update = function()
	{
		this.mesh.position.x = this.player.position.x;
		this.mesh.position.y = this.player.position.y;
		this.mesh.position.z = this.player.position.z*64;
		
		this.mesh.rotation = new THREE.Vector3(0,0,this.player.rotation);
	}


	GTA.render.PlayerRender.prototype.GetPosition = function()
	{
		return this.player.position;
	}

	GTA.render.PlayerRender.prototype.GetRotation = function()
	{
		return this.player.rotation;
	}



})();

