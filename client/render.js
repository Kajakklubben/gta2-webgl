//
// Gets initiliazed by Client
//

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

		window.addEventListener('resize', function(){context.onWindowResize();}, false );
		
		console.log("created render");
		return this;
	};
	
	
	GTA.Client.Render.prototype.Init = function(mapData, styleData)
	{	
	    container = document.createElement('div');
	    document.body.appendChild(container);
		
		
	    this.renderer = new THREE.WebGLRenderer();
	    this.renderer.setSize(window.innerWidth, window.innerHeight);
	    this.renderer.setClearColorHex(0x000000, 1);

	    container.appendChild(this.renderer.domElement);
		
		
	    //default stats  component
	    this.stats = new Stats();
	    this.stats.domElement.style.position = 'absolute';
	    this.stats.domElement.style.top = '0px';
	    container.appendChild(this.stats.domElement);
	
	
		//Scene
	    this.scene = new THREE.Scene();	
	    this.scene.overdraw = true;

		
		//Camera
		var camFov = 50;	
	    this.camera = new THREE.PerspectiveCamera(camFov, window.innerWidth / window.innerHeight, 1, 1500);
		
	    this.camera.position.z = 200;
	    this.camera.position.x = GTA.Constants.CLIENT_SETTING.START_CAM_POSITION[0] * tileSize;
	    this.camera.position.y = GTA.Constants.CLIENT_SETTING.START_CAM_POSITION[1] * tileSize;
		
		//Map
		this.mapRender = new GTA.Render.MapRender();
		this.mapRender.scene = this.scene;
		this.mapRender.camera = this.camera;
		this.mapRender.CreateMesh(mapData, styleData);
		
		this.animate();
	}

	//Being called from client object
	GTA.Client.Render.prototype.update = function()
	{
		for(var i in this.dynamicObjects)
		{   
			this.dynamicObjects[i].Update();
		}
		
		if(this.followTarget != false)
		{
			var target = new GTA.Model.Point(this.camera.position.x-this.followTarget.GetPosition().x,this.camera.position.y-this.followTarget.GetPosition().y);
			var targetZ = (this.camera.position.z-GTA.Constants.RENDER_SETTING.CAM_STANDARD_HEIGHT)-this.followTarget.GetPosition().z*64;
			
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

		var ctx = this;
		requestAnimationFrame( function(){ctx.animate()} );

		this.mapRender.render();

		this.renderer.render( this.mapRender.scene, this.mapRender.camera );
	
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
