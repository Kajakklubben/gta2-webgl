


(function(){
	GTA.namespace("GTA.client");
	//constructor
	GTA.client.Render = function(game) {
		
		this.dynamicObjects = [];
		this.gameInstance = game;
		this.followTarget = null;
		
		var context = this;
		this.gameInstance.OnAddedPlayer = function(player) {context.OnAddedPlayer(player);};
		this.gameInstance.OnRemovedPlayer = function(player) {context.OnRemovedPlayer(player);};
		//window.addEventListener('resize', function(){this.onWindowResize.bind(this);}, false );
		
		console.log("created render");
		return this;
	};
	GTA.client.Render.prototype.Init = function()
	{
		var old = init();
		this.scene = old.scene;
		this.renderer = old.renderer
		this.camera = old.camera;
		this.stats = old.stats;
		this.animate();
	}
		//Being called from client object
	GTA.client.Render.prototype.update = function()
	{
		for(var i in this.dynamicObjects)
		{
			this.dynamicObjects[i].Update();
		}
		
		if(this.followTarget != null)
		{
			var target = new GTA.model.Point(this.camera.position.x-this.followTarget.GetPosition().x,this.camera.position.y-this.followTarget.GetPosition().y);
			this.camera.position.x -= target.x/2;
			this.camera.position.y -= target.y/2;

		}
	}


	GTA.client.Render.prototype.OnAddedPlayer = function (player) {

		var playerRender = new GTA.render.PlayerRender(player);
		player.render = playerRender;

		this.scene.add(playerRender.CreateMesh());
		this.dynamicObjects.push(playerRender);
	}
	GTA.client.Render.prototype.OnRemovedPlayer = function (player) {
		this.scene.remove(player.render.mesh);
		this.dynamicObjects.splice(0,this.dynamicObjects.indexOf(player.render));
	}
	//Currently not being used
	GTA.client.Render.prototype.animate = function () {

		
		requestAnimationFrame( function(){this.animate()} );

	
		this.stats.update();


	}
	GTA.client.Render.prototype.onWindowResize = function() {

		this.windowHalfX = window.innerWidth / 2;
		this.windowHalfY = window.innerHeight / 2;

		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();

		this.renderer.setSize( window.innerWidth, window.innerHeight );

	}



})();
