//
// Gets initialized by Client.Render
//

(function(){
	GTA.namespace("GTA.Render");
	//constructor
	GTA.Render.PlayerRender = function( player ) {
		this.player = player;
		this.style = false;
		
		this.walkIndex = 0;
		
		this.frameUpdate = new Date().getTime();


		
		return this;
	};

	GTA.Render.PlayerRender.prototype.CreateMesh = function()
	{

		this.geometry = new THREE.PlaneGeometry( 1, 1, 1,1 );

		this.materials = this.CreateMaterials();	
		
		
		this.mesh = new THREE.Mesh( this.geometry, this.materials.walking[0].material );
		
		return this.mesh;
	}
	
	GTA.Render.PlayerRender.prototype.CreateMaterials = function(){
		materials = new Object();
		
		materials.walking = new Array();
		for(i=0;i<8;i++){
	 	   	var texture = new THREE.Texture(this.style.sprites.player.running[i].image);
			texture.needsUpdate = true;
			
			obj = new Object();
			obj.material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
			obj.w = this.style.sprites.player.running[i].w;
			obj.h = this.style.sprites.player.running[i].h;
						
			materials.walking.push(obj);
		}
		
		{
	 	   	var texture = new THREE.Texture(this.style.sprites.player.idle.image);
			texture.needsUpdate = true;
		
			obj = new Object();
			obj.material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
			obj.w = this.style.sprites.player.idle.w;
			obj.h = this.style.sprites.player.idle.h;
			materials.idle = obj;
		}
		
	    return materials;
	}
	
	GTA.Render.PlayerRender.prototype.Update = function()
	{
		
		
		this.mesh.position.x = this.player.position.x;
		this.mesh.position.y = this.player.position.y;
		this.mesh.position.z = this.player.position.z*64;
			
		
		
		if(this.player.velocity.getLengthSquared() > 0) {
			if(((new Date().getTime()) - this.frameUpdate) > 60){
				this.frameUpdate = (new Date().getTime());
				
				this.walkIndex ++;
				if(this.walkIndex >= 8)
					this.walkIndex = 0;
				
				
				this.mesh.material = this.materials.walking[this.walkIndex].material;
				this.mesh.scale.x = this.materials.walking[this.walkIndex].w;
				this.mesh.scale.y = this.materials.walking[this.walkIndex].h;
				
			}
		}
		else {
			this.mesh.material = this.materials.idle.material;
			this.mesh.scale.x = this.materials.idle.w;
			this.mesh.scale.y = this.materials.idle.h;
			
		}
		
		this.mesh.rotation = new THREE.Vector3(0,0,this.player.rotation - Math.PI);
	}


	GTA.Render.PlayerRender.prototype.GetPosition = function()
	{
		return this.player.position;
	}

	GTA.Render.PlayerRender.prototype.GetRotation = function()
	{
		return this.player.rotation;
	}



})();

