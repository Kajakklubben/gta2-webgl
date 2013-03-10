


(function(){
	GTA.namespace("GTA.client");
	//constructor
	GTA.client.Render = function(game) {
		
		this.dynamicObjects = [];
		this.gameInstance = game;

		
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
		
		this.renderer.render( this.scene, this.camera );

		//this.camera.position.y = Math.sin(Date.now()/1000)*50;
		//this.camera.position.x = Math.cos(Date.now()/1000)*50;
	}


	GTA.client.Render.prototype.OnAddedPlayer = function (player) {

		var playerRender = new GTA.render.PlayerRender();
		player.render = playerRender;

		this.scene.add(playerRender.createMesh());
		this.dynamicObjects.push(playerRender);
	}
	GTA.client.Render.prototype.OnRemovedPlayer = function (player) {
		this.scene.remove(player.render.mesh);
		dynamicObjects.splice(0,dynamicObjects.indexOf(player.render));
	}
	//Currently not being used
	GTA.client.Render.prototype.animate = function () {

		console.log('render');
		requestAnimationFrame( function(){this.animate()} );

		this.update();
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
