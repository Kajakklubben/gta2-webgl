
var car;

function initPhysics(){
	geometry = new THREE.CubeGeometry( tileSize, tileSize, tileSize );
	material = new THREE.MeshBasicMaterial( { color: 0xffff00, wireframe: false } );

	car = new Object();
	
	car.mesh = new THREE.Mesh( geometry, material );
	car.mesh.position.z = tileSize*5;
	
	car.mesh.position.x = 85 * tileSize;
	car.mesh.position.y = -190 * tileSize;
	
	scene.add( car.mesh );
}

var physicsUpdate = function(){

}