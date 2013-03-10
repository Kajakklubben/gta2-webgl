

(function(){
	GTA.namespace("GTA.render");
	//constructor
	GTA.render.PlayerRender = function( player ) {

		this.player = player;
		return this;
	};

	GTA.render.PlayerRender.prototype.CreateMesh = function()
	{

		this.geometry = new THREE.CubeGeometry( 12, 12, 12 );

		this.material = new THREE.MeshBasicMaterial( { color: 0xfff444 } );

		this.mesh = new THREE.Mesh( this.geometry, this.material );
		this.mesh.position.z = 8*64;
		return this.mesh;
	}
	GTA.render.PlayerRender.prototype.Update = function()
	{
		this.mesh.position.x = this.player.position.x;
		this.mesh.position.y = this.player.position.y;
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