function initPhysics(){
		geometry = new THREE.CubeGeometry( tileSize, tileSize, tileSize );
	material = new THREE.MeshBasicMaterial( { color: 0xffff00, wireframe: false } );

	mesh = new THREE.Mesh( geometry, material );
	mesh.position.z = tileSize*5;
	scene.add( mesh );

}

function renderGameEngine(){
	
}