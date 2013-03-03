
var container, stats;

var camera, scene, renderer;

var cube, plane;

var windowHalfX = window.innerWidth / 2;
var windowHalfY = window.innerHeight / 2;

//init();
//animate();

function init() {

	container = document.createElement( 'div' );
	document.body.appendChild( container );

	var info = document.createElement( 'div' );
	info.style.position = 'absolute';
	info.style.top = '10px';
	info.style.width = '100%';
	info.style.textAlign = 'center';
	info.innerHTML = 'Camere moves in a circle to get perspective';
	container.appendChild( info );

	camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 1000 );
	camera.position.y = 150;
	camera.position.z = 500;


	scene = new THREE.Scene();

	
	createScene();

	// setup renderer
	renderer = new THREE.CanvasRenderer();
	renderer.setSize( window.innerWidth, window.innerHeight );

	container.appendChild( renderer.domElement );


	//default stats  component
	stats = new Stats();
	stats.domElement.style.position = 'absolute';
	stats.domElement.style.top = '0px';
	container.appendChild( stats.domElement );

	document.addEventListener( 'mousedown', onDocumentMouseDown, false );
	document.addEventListener( 'touchstart', onDocumentTouchStart, false );
	document.addEventListener( 'touchmove', onDocumentTouchMove, false );

	//

	window.addEventListener( 'resize', onWindowResize, false );

}

function createScene()
{	
	for (var i = 20; i < 250; i++)
	{	
		for (var j = 20; j < 250; j++)
		{		
			for (var k = 0; k < 8; k++)
			{
				var block = level.map[i][j][k];
				
				if(block != undefined)
				{ 
					//console.log("drew cube");
					if(k==0)
					{
						CreateCube(i, j, k, 0x003399);			
					}
					else if(k==1)
					{
						CreateCube(i, j, k, 0x333333);			
					}
					else if(k==2)
					{
						CreateCube(i, j, k, 0x663300);			
					}
					else if(k==3)
					{
						CreateCube(i, j, k, 0x993300);			
					}
					else if(k==4)
					{
						CreateCube(i, j, k, 0xFF3300);			
					}
					else
					{
						CreateCube(i, j, k, 0xCCCCCC);			
					}
				}
			}
		}
	}

}

function CreateCube(x, y, z, color)
{
	var tileSize = 14;
	var geometry = new THREE.CubeGeometry( tileSize, tileSize, tileSize );
	var material = new THREE.MeshBasicMaterial( { color: color} );

	cube = new THREE.Mesh( geometry, material );
	cube.position.x = (x - 85) * tileSize;
	cube.position.y = -(y - 190) * tileSize;
	cube.position.z = z * tileSize;
	
	scene.add(cube);
}

function onWindowResize() {

	windowHalfX = window.innerWidth / 2;
	windowHalfY = window.innerHeight / 2;

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );

}

//

function onDocumentMouseDown( event ) {

	event.preventDefault();

	document.addEventListener( 'mousemove', onDocumentMouseMove, false );
	document.addEventListener( 'mouseup', onDocumentMouseUp, false );
	document.addEventListener( 'mouseout', onDocumentMouseOut, false );

}

function onDocumentMouseMove( event ) {

	mouseX = event.clientX - windowHalfX;

}

function onDocumentMouseUp( event ) {

	document.removeEventListener( 'mousemove', onDocumentMouseMove, false );
	document.removeEventListener( 'mouseup', onDocumentMouseUp, false );
	document.removeEventListener( 'mouseout', onDocumentMouseOut, false );

}

function onDocumentMouseOut( event ) {

	document.removeEventListener( 'mousemove', onDocumentMouseMove, false );
	document.removeEventListener( 'mouseup', onDocumentMouseUp, false );
	document.removeEventListener( 'mouseout', onDocumentMouseOut, false );

}

function onDocumentTouchStart( event ) {

	if ( event.touches.length === 1 ) {

		event.preventDefault();



	}

}

function onDocumentTouchMove( event ) {

	if ( event.touches.length === 1 ) {

		event.preventDefault();


	}

}

//
function animate() {

	requestAnimationFrame( animate );

	render();
	stats.update();

}

function render() {

	renderer.render( scene, camera );

//	camera.position.y = Math.sin(Date.now()/1000)*50;
	//camera.position.x = Math.cos(Date.now()/1000)*50;

}