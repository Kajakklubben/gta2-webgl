

(function(){
	GTA.namespace("GTA.render");
	//constructor
	GTA.render.PlayerRender = function( player ) {

		this.player = player;
		return this;
	};

	GTA.render.PlayerRender.prototype.createMesh = function()
	{

		this.geometry = new THREE.CubeGeometry( 200, 200, 200 );

		this.material = new THREE.MeshBasicMaterial( { color: 0xfff444 } );

		this.mesh = new THREE.Mesh( this.geometry, this.material );

		return this.mesh;
	}

	GTA.render.PlayerRender.prototype.getPosition = function()
	{
		return player.position;
	}

	GTA.render.PlayerRender.prototype.getRotation = function()
	{
		return player.rotation;
	}



})();