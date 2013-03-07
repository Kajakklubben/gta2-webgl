

(function(){
	GTA.namespace("GTA.model");
	//constructor
	GTA.model.EntityRender = function( ) 
	{

		this.geometry = new THREE.CubeGeometry( 200, 200, 200 );

		this.material = new THREE.MeshBasicMaterial( { color: 0xfff444 } );

		this.mesh = new THREE.Mesh( this.geometry, this.material );


		return this;
	};

	GTA.model.EntityRender.prototype.destroy = function( ) 
	{
		
	}

})();