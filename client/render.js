
(function(){
	GTA.namespace("GTA.client");
	//constructor
	GTA.client.Render = function(game) {
		
		this.gameInstance = game;

		this.container = document.createElement( 'div' );
		document.body.appendChild( this.container );

		var info = document.createElement( 'div' );
		info.style.position = 'absolute';
		info.style.top = '10px';
		info.style.width = '100%';
		info.style.textAlign = 'center';
		info.innerHTML = 'Camere moves in a circle to get perspective';
		this.container.appendChild( info );

		this.camera = new THREE.PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 1, 1000 );
		this.camera.position.y = 150;
		//zoom out here
		this.camera.position.z = 500;

		this.scene = new THREE.Scene();

		// setup renderer
		this.renderer = new THREE.CanvasRenderer();
		this.renderer.setSize( window.innerWidth, window.innerHeight );

		this.container.appendChild( this.renderer.domElement );


		//default stats  component
		this.stats = new Stats();
		this.stats.domElement.style.position = 'absolute';
		this.stats.domElement.style.top = '0px';
		this.container.appendChild( this.stats.domElement );

		//
		window.addEventListener('resize', function(){this.onWindowResize.bind(this);}, false );
		//this.animate();
		return this;
	};

	//Currently not being used
	GTA.client.Render.prototype.animate = function () {


		requestAnimationFrame( function(){this.animate.bind(this);} );

		this.render();
		this.stats.update();

	}
	GTA.client.Render.prototype.onWindowResize = function() {

		this.windowHalfX = window.innerWidth / 2;
		this.windowHalfY = window.innerHeight / 2;

		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();

		this.renderer.setSize( window.innerWidth, window.innerHeight );

	}
	//Being called from client object
	GTA.client.Render.prototype.update = function()
	{
		
		this.renderer.render( this.scene, this.camera );

		//this.camera.position.y = Math.sin(Date.now()/1000)*50;
		//this.camera.position.x = Math.cos(Date.now()/1000)*50;
	}


})();

/*


function createScene()
{
// Cube

	var geometry = new THREE.CubeGeometry( 200, 200, 200 );

	var material = new THREE.MeshBasicMaterial( { color: 0xfff444 } );

	cube = new THREE.Mesh( geometry, material );
	cube.position.y = 150;
	scene.add( cube );
}



*/
