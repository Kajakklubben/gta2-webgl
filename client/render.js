

(function(){
	GTA.namespace("GTA.Client");
	//constructor
	GTA.Client.Render = function(game) {
		
		this.dynamicObjects = [];
		this.gameInstance = game;
		this.followTarget = false;
		
		this.scene = false;
		this.renderer = false;
		this.camera = false;
		this.stats = false;
		
		var context = this;
		this.gameInstance.OnAddedPlayer = function(player) {context.OnAddedPlayer(player);};
		this.gameInstance.OnRemovedPlayer = function(player) {context.OnRemovedPlayer(player);};
		//window.addEventListener('resize', function(){this.onWindowResize.bind(this);}, false );
		
		console.log("created render");
		return this;
	};
	
	
	GTA.Client.Render.prototype.Init = function(mapData, styleData)
	{
		var old = init(mapData, styleData);
		this.scene = old.scene;
		this.renderer = old.renderer
		this.camera = old.camera;
		this.stats = old.stats;
		this.animate();
	}

	//Being called from client object
	GTA.Client.Render.prototype.update = function()
	{
		for(var i in this.dynamicObjects)
		{   
			this.dynamicObjects[i].Update();
		}
		
		if(this.followTarget != null)
		{
			var target = new GTA.Model.Point(this.camera.position.x-this.followTarget.GetPosition().x,this.camera.position.y-this.followTarget.GetPosition().y);
			var targetZ = (this.camera.position.z-400)-this.followTarget.GetPosition().z*64;
			
			this.camera.position.x -= target.x/2;
			this.camera.position.y -= target.y/2;
			this.camera.position.z -= targetZ/10;
		}
	}


	GTA.Client.Render.prototype.OnAddedPlayer = function (player) {

		var playerRender = new GTA.Render.PlayerRender(player);
		player.render = playerRender;

		this.scene.add(playerRender.CreateMesh());
		this.dynamicObjects.push(playerRender);
	}
	
	GTA.Client.Render.prototype.OnRemovedPlayer = function (player) {
		this.scene.remove(player.render.mesh);
		this.dynamicObjects.splice(0,this.dynamicObjects.indexOf(player.render));
	}

	//Currently not being used
	GTA.Client.Render.prototype.animate = function () {

		
		requestAnimationFrame( function(){this.animate()} );

	
		this.stats.update();


	}
	
	GTA.Client.Render.prototype.onWindowResize = function() {

		this.windowHalfX = window.innerWidth / 2;
		this.windowHalfY = window.innerHeight / 2;

		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();

		this.renderer.setSize( window.innerWidth, window.innerHeight );

	}



})();
